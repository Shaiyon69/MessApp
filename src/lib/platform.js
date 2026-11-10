/**
 * Which shell runs the web app. isTauri() alone is true on Tauri desktop and on
 * Tauri Android, so desktop-only code (updater, desktop notifications and UI)
 * asks isTauriDesktop instead.
 */
import { isTauri } from '@tauri-apps/api/core'

export const isAndroidUserAgent = (userAgent = globalThis.navigator?.userAgent || '') => /Android/i.test(userAgent)

export const isTauriMobile = () => isTauri() && isAndroidUserAgent()

export const isTauriDesktop = () => isTauri() && !isAndroidUserAgent()
