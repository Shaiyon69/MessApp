/**
 * Signs the user out and resets local state. Two entry points call this — the
 * settings account pane and the menu sheet — so the cleanup lives here rather
 * than being duplicated: forgetting to preserve a key in one copy silently
 * destroys E2EE private keys, which are not recoverable.
 */
import { supabase } from '../supabaseClient.js'
import { disableCurrentPushDevice, reportPushError, stopNativePushRegistration, PUSH_INSTALLATION_ID_KEY } from './pushDevices.js'

/* Preferences and key material survive a sign-out; session state does not. */
const isPreservedKey = (key) => Boolean(key) && (
  key.startsWith('e2ee_') ||
  key === PUSH_INSTALLATION_ID_KEY ||
  key === 'appTheme' ||
  key === 'surfaceTint' ||
  key === 'soundEnabled' ||
  key === 'messageSoundsEnabled' ||
  key === 'callSoundsEnabled' ||
  key === 'ringtoneSoundsEnabled' ||
  key === 'tactileFeedbackEnabled' ||
  key === 'notificationsEnabled'
)

export function collectPreservedKeys(storage) {
  const preserved = {}
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (isPreservedKey(key)) preserved[key] = storage.getItem(key)
  }
  return preserved
}

/**
 * Throws on failure so the caller can surface it; the caller reloads on success.
 */
export async function signOutAndReset({ profileId }) {
  await disableCurrentPushDevice({ profileId, reason: 'logout' }).catch(error => reportPushError('logout_disable', error))
  await stopNativePushRegistration().catch(error => reportPushError('logout_listener_cleanup', error))

  const { error } = await supabase.auth.signOut()
  if (error) throw error

  const preserved = collectPreservedKeys(localStorage)
  localStorage.clear()
  for (const [key, value] of Object.entries(preserved)) localStorage.setItem(key, value)

  window.location.reload()
}
