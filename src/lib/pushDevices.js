/**
 * Owns per-installation push identity and token persistence. Push tokens are
 * credentials: callers receive lifecycle results but must never log token values.
 */
import { Capacitor } from '@capacitor/core'
import { supabase } from '../supabaseClient.js'
import { debug } from './debug.js'
import { publishPushNavigation } from './pushNavigation.js'

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

  const { data, error } = await client.rpc('register_push_device', {
    target_installation_id: installationId,
    target_platform: platform,
    target_push_token: pushToken
  })
  if (error) throw error

  const refreshed = Boolean(data?.refreshed)
  debug.info(refreshed ? 'PUSH_TOKEN_REFRESH' : 'PUSH_REGISTER', {
    platform,
    installationKnown: true,
    tokenPresent: true,
    reenabled: Boolean(data?.reenabled)
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

// Reported per installation, not per account: only the device showing the
// conversation should go quiet, every other device the user owns still rings.
// Failures are logged rather than thrown — a missed report costs one redundant
// notification, and must never break the chat view that called it.
export const reportActiveConversation = async ({
  profileId,
  conversationId,
  installationId = getInstallationId(),
  client = supabase
}) => {
  if (!profileId) return { reported: false }
  const { error } = await client
    .from('push_devices')
    .update({
      active_conversation_id: conversationId || null,
      active_conversation_at: conversationId ? new Date().toISOString() : null
    })
    .eq('profile_id', profileId)
    .eq('installation_id', installationId)
  if (error) {
    reportPushError('active_conversation', error)
    return { reported: false }
  }
  return { reported: true, cleared: !conversationId }
}

export const urlBase64ToBytes = value => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0))
}

const sameBytes = (left, right) => left.length === right.length && left.every((byte, index) => byte === right[index])

export const registerWebPushDevice = async ({ profileId, client = supabase, vapidPublicKey }) => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Web push is not supported')
  if (!vapidPublicKey) throw new Error('Web push public key is not configured')
  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const applicationServerKey = urlBase64ToBytes(vapidPublicKey)
  const existing = await registration.pushManager.getSubscription()
  // A subscription made under another key (the old Firebase one) makes subscribe() throw.
  const existingKey = existing?.options?.applicationServerKey
  if (existing && (!existingKey || !sameBytes(new Uint8Array(existingKey), applicationServerKey))) {
    await existing.unsubscribe()
  }
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
  return upsertPushDevice({
    profileId,
    pushToken: JSON.stringify(subscription),
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
  if (getPushPlatform() === 'android') {
    await PushNotifications.createChannel({
      id: 'messages',
      name: 'Messages',
      description: 'Direct messages and server activity',
      importance: 4,
      visibility: 1,
      vibration: true
    })
  }
  let resolveRegistration
  let rejectRegistration
  const registrationComplete = new Promise((resolve, reject) => {
    resolveRegistration = resolve
    rejectRegistration = reject
  })
  const registrationHandle = await PushNotifications.addListener('registration', async token => {
    try {
      const result = await upsertPushDevice({ profileId, pushToken: token.value, client })
      resolveRegistration(result)
    } catch (error) {
      reportPushError('native_token_upsert', error)
      rejectRegistration(error)
    }
  })
  const errorHandle = await PushNotifications.addListener('registrationError', error => {
    reportPushError('native_registration', error)
    rejectRegistration(new Error(error?.error || 'Native push registration failed'))
  })
  const actionHandle = await PushNotifications.addListener('pushNotificationActionPerformed', action => {
    publishPushNavigation(action?.notification?.data)
  })
  nativeRegistrationOwner = { profileId, handles: [registrationHandle, errorHandle, actionHandle] }
  await PushNotifications.register()
  let timeoutId
  try {
    const registration = await Promise.race([
      registrationComplete,
      new Promise((_resolve, reject) => {
        timeoutId = globalThis.setTimeout(() => reject(new Error('Native push registration timed out')), 15_000)
      })
    ])
    return { supported: true, permission: 'granted', registration }
  } catch (error) {
    await stopNativePushRegistration()
    throw error
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId)
  }
}

export const reportPushError = (operation, error) => {
  debug.error('PUSH_ERROR', { operation, error })
}
