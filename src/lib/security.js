/** URL and profile-name validation shared by untrusted rendered content. */
export function safeHttpUrl(value) {
  if (typeof value !== 'string') return null
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    return parsed.href
  } catch (_err) {
    return null
  }
}

export function safeMediaUrl(value, { allowDataImages = true, allowBlob = true } = {}) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()

  if (allowDataImages && /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) {
    return trimmed
  }

  try {
    const parsed = new URL(trimmed)
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.href
    if (allowBlob && parsed.protocol === 'blob:') return parsed.href
    return null
  } catch (_err) {
    return null
  }
}

export function isValidUsername(value) {
  return /^[\p{L}\p{N}_ .-]{2,32}$/u.test(value.trim())
}

export function normalizeProfileBaseName(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24)
}
