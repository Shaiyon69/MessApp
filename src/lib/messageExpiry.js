/**
 * Disappearing messages. The sender picks a lifetime in the composer and it is
 * written to `messages.expires_at`; the read policy stops returning the row once
 * it passes, so this module only has to keep an already-open conversation and
 * its local cache honest between refetches.
 *
 * Expiry is measured from send time, not from first read — a read receipt is not
 * something either client can be trusted to report.
 */

/** Composer choices. `seconds: null` is the default, non-expiring send. */
export const DISAPPEARING_OPTIONS = [
  { id: 'off', label: 'Off', seconds: null },
  { id: '1h', label: '1 hour', seconds: 60 * 60 },
  { id: '24h', label: '24 hours', seconds: 24 * 60 * 60 },
  { id: '7d', label: '7 days', seconds: 7 * 24 * 60 * 60 }
]

/** How often an open conversation re-checks its own list. */
export const EXPIRY_SWEEP_MS = 15000

/** @returns {string|null} an ISO timestamp, or null for a normal message. */
export function expiresAtFrom(seconds, now = Date.now()) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null
  return new Date(now + seconds * 1000).toISOString()
}

export function isExpired(message, now = Date.now()) {
  if (!message?.expires_at) return false
  const expiresAt = new Date(message.expires_at).getTime()
  // An unparseable stamp is treated as "no expiry" rather than hiding the
  // message: losing a message to bad data is worse than showing one too long.
  return Number.isFinite(expiresAt) && expiresAt <= now
}

/**
 * Returns the same array reference when nothing expired, so callers can pass the
 * result straight to setState without forcing a render on every sweep.
 */
export function dropExpired(messages, now = Date.now()) {
  if (!Array.isArray(messages) || !messages.length) return messages
  const kept = messages.filter(message => !isExpired(message, now))
  return kept.length === messages.length ? messages : kept
}

/** Short label for the composer chip, e.g. "24h". */
export function describeExpiry(seconds) {
  const option = DISAPPEARING_OPTIONS.find(item => item.seconds === (seconds || null))
  return option && option.seconds ? option.id : ''
}
