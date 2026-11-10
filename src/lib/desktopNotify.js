/**
 * Native OS notifications for the Tauri desktop app. Web push needs a browser
 * push service, which the desktop webview does not have, so the desktop app
 * notifies from the Realtime events it already receives while running.
 * Everywhere else these calls do nothing.
 */
import { isTauriDesktop } from './platform.js'

const plugin = () => import('@tauri-apps/plugin-notification')

export const isDesktopApp = () => isTauriDesktop()

// Returns 'granted' | 'denied' | 'default', like Notification.permission.
export async function requestDesktopPermission() {
  const { isPermissionGranted, requestPermission } = await plugin()
  if (await isPermissionGranted()) return 'granted'
  return requestPermission()
}

export function shouldNotify({ enabled, focused, isOwnMessage, isOpenRoom }) {
  if (!enabled || isOwnMessage) return false
  return !focused || !isOpenRoom
}

export async function notifyDesktop({ title, body, isOwnMessage, isOpenRoom }) {
  if (!isTauriDesktop()) return
  const enabled = localStorage.getItem('notificationsEnabled') === 'true'
  if (!shouldNotify({ enabled, focused: document.hasFocus(), isOwnMessage, isOpenRoom })) return
  const { isPermissionGranted, sendNotification } = await plugin()
  if (await isPermissionGranted()) sendNotification({ title, body })
}
