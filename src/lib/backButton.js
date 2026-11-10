/**
 * Android back button for both shells. Capacitor fires `backButton`; Tauri
 * Android fires `onBackButtonPress`, and without a listener it walks webview
 * history and then closes the app.
 */
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { exit, onBackButtonPress } from '@tauri-apps/api/app'
import { isTauriMobile } from './platform'

export const hasBackButton = () => Capacitor.isNativePlatform() || isTauriMobile()

// Returns a cleanup that also covers a listener still being registered.
export const onBackButton = (handler) => {
  let listener
  let removed = false
  const pending = isTauriMobile()
    ? onBackButtonPress(() => handler())
    : Capacitor.isNativePlatform() ? CapacitorApp.addListener('backButton', () => handler()) : null
  pending?.then(h => { if (removed) (h.unregister ?? h.remove).call(h); else listener = h })
  return () => {
    removed = true
    if (listener) (listener.unregister ?? listener.remove).call(listener)
  }
}

export const exitApp = () => (isTauriMobile() ? exit(0) : CapacitorApp.exitApp())
