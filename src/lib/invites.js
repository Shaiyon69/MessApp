/**
 * Server invite links. A link is the public web app's /invite/CODE path, so it
 * opens in any browser and pastes into the desktop and mobile apps' join box.
 * Codes are the invites table's 12-character hex codes.
 */

// The installed apps run on tauri:// and capacitor:// origins, which are not
// shareable, so links always point at the public web app.
export const INVITE_BASE_URL = (import.meta.env?.VITE_PUBLIC_WEB_URL || 'https://messapp-tau.vercel.app').replace(/\/+$/, '')

const CODE = '[A-Za-z0-9]{6,32}'
// A fresh RegExp per call: a shared /g pattern carries lastIndex between calls.
const linkPattern = () => new RegExp(`(?:https?://[^\\s/]+)?/invite/(${CODE})(?![A-Za-z0-9])`, 'g')

export const inviteUrl = code => `${INVITE_BASE_URL}/invite/${code}`

/** A pasted link or a bare code, as the uppercase code; null for anything else. */
export function parseInviteCode(input) {
  const text = String(input || '').trim()
  if (!text) return null
  const link = linkPattern().exec(text)
  if (link) return link[1].toUpperCase()
  return new RegExp(`^${CODE}$`).test(text) ? text.toUpperCase() : null
}

/** Every distinct invite code linked in a message, in order. */
export function findInviteCodes(text) {
  const codes = []
  for (const match of String(text || '').matchAll(linkPattern())) {
    const code = match[1].toUpperCase()
    if (!codes.includes(code)) codes.push(code)
  }
  return codes
}

/** The entry path an invite link opens the web app on, or null. */
export function inviteCodeFromPath(pathname) {
  const match = /^\/invite\/([A-Za-z0-9]{6,32})\/?$/.exec(pathname || '')
  return match ? match[1].toUpperCase() : null
}

export const EXPIRY_OPTIONS = [
  { id: '30m', label: '30 minutes', seconds: 30 * 60 },
  { id: '1h', label: '1 hour', seconds: 60 * 60 },
  { id: '6h', label: '6 hours', seconds: 6 * 60 * 60 },
  { id: '12h', label: '12 hours', seconds: 12 * 60 * 60 },
  { id: '1d', label: '1 day', seconds: 24 * 60 * 60 },
  { id: '7d', label: '7 days', seconds: 7 * 24 * 60 * 60 },
  { id: 'never', label: 'Never', seconds: null }
]

export const USES_OPTIONS = [
  { id: 'unlimited', label: 'No limit', uses: null },
  { id: '1', label: '1 use', uses: 1 },
  { id: '5', label: '5 uses', uses: 5 },
  { id: '10', label: '10 uses', uses: 10 },
  { id: '25', label: '25 uses', uses: 25 },
  { id: '100', label: '100 uses', uses: 100 }
]

export const DEFAULT_EXPIRY_ID = '7d'
export const DEFAULT_USES_ID = 'unlimited'

/** The expires_at to request for an expiry option, as an ISO string or null. */
export function expiresAtFor(expiryId, now = Date.now()) {
  const option = EXPIRY_OPTIONS.find(item => item.id === expiryId)
  if (!option || option.seconds == null) return null
  return new Date(now + option.seconds * 1000).toISOString()
}

export const usesFor = usesId => USES_OPTIONS.find(item => item.id === usesId)?.uses ?? null

/** Whether an invite row can still be used. */
export function inviteState(invite, now = Date.now()) {
  if (!invite) return 'invalid'
  if (invite.revoked_at) return 'revoked'
  if (invite.expires_at && new Date(invite.expires_at).getTime() <= now) return 'expired'
  if (invite.uses_left != null && invite.uses_left <= 0) return 'exhausted'
  return 'valid'
}

/** "Expires in 3 days", "Never expires", "Expired". */
export function describeExpiry(expiresAt, now = Date.now()) {
  if (!expiresAt) return 'Never expires'
  const ms = new Date(expiresAt).getTime() - now
  if (ms <= 0) return 'Expired'
  const minutes = Math.ceil(ms / 60000)
  if (minutes < 60) return `Expires in ${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.ceil(minutes / 60)
  if (hours < 24) return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.ceil(hours / 24)
  return `Expires in ${days} day${days === 1 ? '' : 's'}`
}

/** What a failed join or preview says, from the RPC's exception text. */
export function inviteErrorMessage(error) {
  const text = String(error?.message || '')
  if (text.includes('revoked')) return 'This invite was cancelled.'
  if (text.includes('expired')) return 'This invite has expired.'
  if (text.includes('exhausted')) return 'This invite has no uses left.'
  if (text.includes('membership unavailable')) return 'You cannot join this server.'
  if (text.includes('friends only')) return 'You can only send invites to friends.'
  if (text.includes('invalid invite')) return 'This invite is not valid.'
  return 'Something went wrong with this invite.'
}

/** Window event an invite card fires to open the invite preview. */
export const OPEN_INVITE_EVENT = 'messapp:open-invite'
