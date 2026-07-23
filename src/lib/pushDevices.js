/**
 * Owns per-installation push identity and token persistence. Push tokens are
 * credentials: callers receive lifecycle results but must never log token values.
 */
import { Capacitor } from '@capacitor/core'
import { supabase } from '../supabaseClient.js'
import { debug } from './debug.js'

export const PUSH_INSTALLATION_ID_KEY = 'messapp_push_installation_id'
const PLATFORM_LABELS = new Set(['android', 'ios', 'web'])
let nativeRegistrationOwner = null

const randomInstallationId = (cryptoApi = globalThis.crypto) => {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  const bytes = new Uint8Array(16)
  cryptoApi?.getRandomValues?.(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

// This ID belongs to the app installation, not the signed-in account, so it is
// deliberately preserved across logout and paired with profile_id in the database.
export const getInstallationId = (storage = globalThis.localStorage, cryptoApi = globalThis.crypto) => {
  const existing = storage?.getItem?.(PUSH_INSTALLATION_ID_KEY)
  if (existing && existing.length >= 16) return existing
  const installationId = randomInstallationId(cryptoApi)
  storage?.setItem?.(PUSH_INSTALLATION_ID_KEY, installationId)
  return installationId
}

export const getPushPlatform = (capacitor = Capacitor) => {
  const platform = capacitor?.getPlatform?.()
  return PLATFORM_LABELS.has(platform) ? platform : 'web'
}

export const upsertPushDevice = async ({
  profileId,
  pushToken,
  platform = getPushPlatform(),
  installationId = getInstallationId(),
  client = supabase
}) => {
  if (!profileId || !pushToken || !PLATFORM_LABELS.has(platform)) throw new Error('Invalid push-device registration')

  const { data: existing, error: readError } = await client
    .from('push_devices')
    .select('id, push_token, enabled')
    .eq('profile_id', profileId)
    .eq('installation_id', installationId)
    .maybeSingle()
  if (readError) throw readError

  // Disable an older row owned by this user before activating a refreshed token.
  const { error: duplicateError } = await client
    .from('push_devices')
    .update({ enabled: false })
    .eq('profile_id', profileId)
    .eq('push_token', pushToken)
    .neq('installation_id', installationId)
  if (duplicateError) throw duplicateError

  const { error } = await client.from('push_devices').upsert({
    profile_id: profileId,
    installation_id: installationId,
    platform,
    push_token: pushToken,
    enabled: true,
    last_seen_at: new Date().toISOString()
  }, { onConflict: 'profile_id,installation_id' })
  if (error) throw error

  const refreshed = Boolean(existing && existing.push_token !== pushToken)
  debug.info(refreshed ? 'PUSH_TOKEN_REFRESH' : 'PUSH_REGISTER', {
    platform,
    installationKnown: true,
    tokenPresent: true,
    reenabled: Boolean(existing && !existing.enabled)
  })
  return { refreshed, platform, installationId }
}

export const disableCurrentPushDevice = async ({
  profileId,
  installationId = getInstallationId(),
  client = supabase,
  reason = 'user_action'
}) => {
  if (!profileId) return { disabled: false }
  const { error } = await client
    .from('push_devices')
    .update({ enabled: false, last_seen_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .eq('installation_id', installationId)
  if (error) throw error
  debug.info('PUSH_DEVICE_DISABLE', { reason, installationKnown: true })
  return { disabled: true }
}

const decodeVapidKey = value => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(globalThis.atob(base64), character => character.charCodeAt(0))
}

export const registerWebPushDevice = async ({ profileId, client = supabase, vapidPublicKey }) => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Web push is not supported')
  if (!vapidPublicKey) throw new Error('Web push public key is not configured')
  const registration = await navigator.serviceWorker.register('/sw.js')
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidKey(vapidPublicKey)
  })
  return upsertPushDevice({
    profileId,
    pushToken: JSON.stringify(subscription.toJSON()),
    platform: 'web',
    client
  })
}

export const stopNativePushRegistration = async () => {
  const owner = nativeRegistrationOwner
  nativeRegistrationOwner = null
  await Promise.all((owner?.handles || []).map(handle => handle?.remove?.()))
}

export const configureNativePushRegistration = async ({ profileId, requestPermission = false, client = supabase }) => {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('PushNotifications')) {
    return { supported: false, permission: 'unsupported' }
  }

  const { PushNotifications } = await import('@capacitor/push-notifications')
  let permission = await PushNotifications.checkPermissions()
  if (requestPermission && permission.receive === 'prompt') permission = await PushNotifications.requestPermissions()
  debug.info('PUSH_PERMISSION', { platform: getPushPlatform(), state: permission.receive })

  if (permission.receive !== 'granted') {
    await stopNativePushRegistration()
    await disableCurrentPushDevice({ profileId, client, reason: 'permission_denied' })
      .catch(error => reportPushError('permission_denied_disable', error))
    return { supported: true, permission: permission.receive }
  }

  if (nativeRegistrationOwner?.profileId === profileId) {
    await PushNotifications.register()
    return { supported: true, permission: 'granted' }
  }

  await stopNativePushRegistration()
  const registrationHandle = await PushNotifications.addListener('registration', token => {
    upsertPushDevice({ profileId, pushToken: token.value, client })
      .catch(error => reportPushError('native_token_upsert', error))
  })
  const errorHandle = await PushNotifications.addListener('registrationError', error => {
    reportPushError('native_registration', error)
  })
  nativeRegistrationOwner = { profileId, handles: [registrationHandle, errorHandle] }
  await PushNotifications.register()
  return { supported: true, permission: 'granted' }
}

export const reportPushError = (operation, error) => {
  debug.error('PUSH_ERROR', { operation, error })
}
