import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from '../supabaseClient'

const TOKEN_STORAGE_KEY = 'messapp_fcm_token'
const NOTIFICATION_PREFS_KEY = 'messapp_notification_prefs'

export function getStoredPushToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function getNotificationPrefs() {
  try {
    const prefs = localStorage.getItem(NOTIFICATION_PREFS_KEY)
    return prefs ? JSON.parse(prefs) : {
      messages: true,
      mentions: true,
      calls: true,
      dms: true,
      servers: false
    }
  } catch {
    return {
      messages: true,
      mentions: true,
      calls: true,
      dms: true,
      servers: false
    }
  }
}

export function updateNotificationPrefs(prefs) {
  try {
    localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}

function storePushToken(token) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } catch {
    // ignore (private mode / storage disabled)
  }
}

// Web push notification support
export async function requestWebPushPermission() {
  if (!('Notification' in window)) {
    throw new Error('This browser does not support notifications')
  }

  if (Notification.permission === 'granted') {
    return true
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }

  return false
}

export async function showWebNotification(title, options = {}) {
  if (!('Notification' in window)) return

  const hasPermission = await requestWebPushPermission()
  if (!hasPermission) return

  const notification = new Notification(title, {
    icon: '/vite.svg',
    badge: '/vite.svg',
    tag: 'messapp',
    requireInteraction: false,
    ...options
  })

  notification.onclick = () => {
    window.focus()
    notification.close()
    if (options.onClick) {
      options.onClick()
    }
  }

  setTimeout(() => notification.close(), 5000)
}

/**
 * Enhanced push notification initialization with web support
 */
export async function initPushNotifications({
  onToken,
  onNotification,
  onNotificationAction,
  onError,
  session
} = {}) {
  const remove = []

  // Web push notifications
  if (!Capacitor.isNativePlatform()) {
    try {
      const hasPermission = await requestWebPushPermission()
      if (hasPermission) {
        console.log('[push] Web notifications enabled')
      }
    } catch (e) {
      console.warn('[push] Web notifications not available:', e.message)
    }
    return () => {}
  }

  // Native push notifications
  try {
    const permStatus = await PushNotifications.checkPermissions()
    const finalPerm =
      permStatus.receive === 'granted'
        ? permStatus
        : await PushNotifications.requestPermissions()

    if (finalPerm.receive !== 'granted') {
      onError?.(new Error('Push notification permission not granted'))
      return () => {}
    }

    remove.push(
      await PushNotifications.addListener('registration', async (token) => {
        if (token?.value) {
          storePushToken(token.value)
          
          // Store token in Supabase for the user
          if (session?.user?.id) {
            try {
              await supabase
                .from('profiles')
                .update({ fcm_token: token.value })
                .eq('id', session.user.id)
            } catch (err) {
              console.warn('[push] Failed to store token in database:', err)
            }
          }
          
          onToken?.(token.value)
        }
      })
    )

    remove.push(
      await PushNotifications.addListener('registrationError', (err) => {
        onError?.(err)
      })
    )

    remove.push(
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[push] Received notification:', notification)
        onNotification?.(notification)
      })
    )

    remove.push(
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('[push] Notification action performed:', action)
        onNotificationAction?.(action)
      })
    )

    await PushNotifications.register()
  } catch (e) {
    onError?.(e)
  }

  return () => {
    for (const sub of remove) sub?.remove?.()
  }
}

export async function sendPushNotification(userId, title, body, data = {}) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('fcm_token')
      .eq('id', userId)
      .single()

    if (profile?.fcm_token) {
      // This would typically call a server function to send the push notification
      console.log('[push] Would send notification to:', userId, title)
    }
  } catch (err) {
    console.error('[push] Failed to send push notification:', err)
  }
}

