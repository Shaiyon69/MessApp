/**
 * Chimaera (the game launcher) tracks "now playing" on the Realtime presence
 * channel chimaera-presence-<userId>, payload { playing: { title, objectId,
 * shop, iconUrl } | null, since } (Chimaera's presence-core.ts). Someone has
 * entries there while Chimaera runs; playing is null when they share nothing.
 *
 * shortcut: the channel is public, so any signed-in client can join it and
 * track a fake game; fine for a label, move to private channels with RLS on
 * realtime.messages (in both apps) if it ever carries more.
 */
import { cleanStatusNote } from './statusNote.js'

export const chimaeraChannelName = userId => `chimaera-presence-${userId}`

export const NOT_IN_CHIMAERA = { online: false, playing: null }

/** Channel presence entries to { online, playing }. Every entry is untrusted. */
export const toGamePresence = entries => {
  if (!Array.isArray(entries) || !entries.length) return NOT_IN_CHIMAERA
  // One user can have several Chimaera windows open; the newest entry wins.
  const latest = entries.reduce((a, b) => ((Number(b?.since) || 0) > (Number(a?.since) || 0) ? b : a))
  const playing = latest?.playing
  const title = typeof playing?.title === 'string' && typeof playing.objectId === 'string' ? cleanStatusNote(playing.title) : ''
  return { online: true, playing: title ? { title } : null }
}
