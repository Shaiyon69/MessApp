/**
 * Desktop self-update (tauri-plugin-updater). The manifest is served from the
 * public Skibidevs site because the MessApp repo and its releases are private.
 * Installers are signed in CI; the plugin refuses anything the pubkey in
 * tauri.conf.json did not sign.
 */
import { isTauriDesktop } from './platform.js'
import { debug } from './debug.js'

// Resolves to the pending update, or null when there is none or not on desktop.
export async function findDesktopUpdate() {
  if (!isTauriDesktop()) return null
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    return await check()
  } catch (error) {
    // Offline or manifest missing: not worth bothering the user about.
    debug.warn('DESKTOP_UPDATE', { stage: 'check', error: error?.message })
    return null
  }
}

// Windows: the NSIS installer closes and relaunches the app before this resolves.
// Linux: the AppImage file is replaced in place, so relaunch into it.
export async function installDesktopUpdate(update) {
  await update.downloadAndInstall()
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('restart_app')
}
