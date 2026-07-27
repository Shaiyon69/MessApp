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

const getWebFirebaseConfig = () => {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  }
  const missing = ['apiKey', 'projectId', 'messagingSenderId', 'appId'].filter(key => !config[key])
  if (missing.length > 0) throw new Error(`Web push is missing Firebase configuration: ${missing.join(', ')}`)
  return config
}

export const registerWebPushDevice = async ({ profileId, client = supabase, vapidPublicKey }) => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Web push is not supported')
  if (!vapidPublicKey) throw new Error('Web push public key is not configured')
  const [
    { getApp, getApps, initializeApp },
    { getMessaging, getToken, isSupported: isWebMessagingSupported }
  ] = await Promise.all([
    import('firebase/app'),
    import('firebase/messaging')
  ])
  if (!await isWebMessagingSupported()) throw new Error('Firebase messaging is not supported in this browser')
  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const app = getApps().length > 0 ? getApp() : initializeApp(getWebFirebaseConfig())
  const pushToken = await getToken(getMessaging(app), {
    vapidKey: vapidPublicKey,
    serviceWorkerRegistration: registration
  })
  if (!pushToken) throw new Error('Firebase did not issue a web push token')
  return upsertPushDevice({
    profileId,
    pushToken,
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
