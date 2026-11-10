/**
 * Chimaera (the game launcher) tracks "now playing" on the Realtime presence
 * channel chimaera-presence-<userId>, payload { playing: { title, objectId,
 * shop, iconUrl, startedAt? } | null, since } (Chimaera's presence-core.ts). Someone has
 * entries there while Chimaera runs; playing is null when they share nothing.
 *
 * shortcut: the channel is public, so any signed-in client can join it and
 * track a fake game; fine for a label, move to private channels with RLS on
 * realtime.messages (in both apps) if it ever carries more.
 */
import { cleanStatusNote } from './statusNote.js'

export const chimaeraChannelName = userId => `chimaera-presence-${userId}`

export const NOT_IN_CHIMAERA = { online: false, playing: null }

// Only plain https images from the untrusted payload; never local or data URLs.
const httpsUrl = value => {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** Channel presence entries to { online, playing }. Every entry is untrusted. */
export const toGamePresence = (entries, now = Date.now()) => {
  if (!Array.isArray(entries) || !entries.length) return NOT_IN_CHIMAERA
  // One user can have several Chimaera windows open; the newest entry wins.
  const latest = entries.reduce((a, b) => ((Number(b?.since) || 0) > (Number(a?.since) || 0) ? b : a))
  const playing = latest?.playing
  const title = typeof playing?.title === 'string' && typeof playing.objectId === 'string' ? cleanStatusNote(playing.title) : ''
  if (!title) return { online: true, playing: null }
  const start = playing.startedAt
  // A minute of slack for clock skew between the two devices.
  const startedAt = Number.isFinite(start) && start > 0 && start <= now + 60_000 ? start : null
  const iconUrl = httpsUrl(playing.iconUrl)
  // Steam's store CDN sends CORS headers, so its cover can be read for a colour; others try the icon.
  const coverUrl = playing.shop === 'steam' && /^\d{1,10}$/.test(playing.objectId)
    ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${playing.objectId}/header.jpg`
    : iconUrl
  return { online: true, playing: { title, startedAt, iconUrl, coverUrl } }
}

/** "1h 05m" / "12m"; null under a minute or without a start time. */
export const playtimeLabel = (startedAt, now = Date.now()) => {
  if (!startedAt) return null
  const minutes = Math.floor(Math.max(0, now - startedAt) / 60_000)
  if (minutes < 1) return null
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`
}
