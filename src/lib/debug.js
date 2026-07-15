/**
 * Centralizes local structured diagnostics at important lifecycle boundaries.
 * Routine events are silent in production unless `messappDebug` is enabled;
 * warnings and errors remain available. Metadata is recursively sanitized so
 * auth material, message bodies, signed URLs, and attachment content cannot
 * accidentally reach the console.
 */

const SENSITIVE_KEY = /(?:access.?token|refresh.?token|password|passphrase|private.?key|encrypted.?key|service.?role|authorization|cookie|signed.?url|message.?content|attachment.?content|fcm.?token|device.?token)/i
const URL_KEY = /(?:url|uri)$/i
const MAX_DEPTH = 4

const routineEnabled = () => {
  if (!import.meta.env.PROD) return true
  try { return localStorage.getItem('messappDebug') === 'true' } catch (_err) { return false }
}

const sanitizeValue = (value, key = '', depth = 0, seen = new WeakSet()) => {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]'
  if (value == null || ['boolean', 'number'].includes(typeof value)) return value
  if (typeof value === 'string') {
    if (URL_KEY.test(key) || /(?:token|signature|key)=/i.test(value)) return '[REDACTED_URL]'
    return value.slice(0, 500)
  }
  if (depth >= MAX_DEPTH) return '[TRUNCATED]'
  if (value instanceof Error) return sanitizeValue({ name: value.name, message: value.message, code: value.code, details: value.details, hint: value.hint }, key, depth + 1, seen)
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) return '[CIRCULAR]'
  seen.add(value)
  if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitizeValue(item, key, depth + 1, seen))
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeValue(childValue, childKey, depth + 1, seen)]))
}

const emit = (level, label, metadata) => {
  if ((level === 'debug' || level === 'info') && !routineEnabled()) return
  const eventLabel = typeof label === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(label) ? label : 'APP_DIAGNOSTIC'
  console[level](`[${eventLabel}]`, sanitizeValue(metadata || {}))
}

/** Emits safe structured events; callers should pass stable uppercase labels. */
export const debug = Object.freeze({
  debug: (label, metadata) => emit('debug', label, metadata),
  info: (label, metadata) => emit('info', label, metadata),
  warn: (label, metadata) => emit('warn', label, metadata),
  error: (label, metadata) => emit('error', label, metadata)
})
