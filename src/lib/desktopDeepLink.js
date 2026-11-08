/**
 * Desktop messapp:// links (tauri-plugin-deep-link). The OS starts the app with
 * the link, or tauri-plugin-single-instance hands it to the app already running.
 */
import { isTauri } from '@tauri-apps/api/core'
import { parseInviteCode } from './invites.js'
import { debug } from './debug.js'

// getCurrent() keeps returning the launch link, so open it once per run, not on every sign-in.
let launchLinkHandled = false

/** Calls onInvite(code) for each invite link the app is opened with; returns the unsubscribe. */
export function listenForInviteLinks(onInvite) {
  if (!isTauri()) return () => {}
  let stopped = false
  let unlisten = null
  const handle = urls => {
    const code = (urls || []).map(parseInviteCode).find(Boolean)
    if (code && !stopped) onInvite(code)
  }
  import('@tauri-apps/plugin-deep-link')
    .then(async ({ getCurrent, onOpenUrl }) => {
      if (!launchLinkHandled) {
        launchLinkHandled = true
        handle(await getCurrent())
      }
      const stop = await onOpenUrl(handle)
      if (stopped) stop()
      else unlisten = stop
    })
    .catch(error => debug.warn('DEEP_LINK', { error: error?.message }))
  return () => {
    stopped = true
    unlisten?.()
  }
}
