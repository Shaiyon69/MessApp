/**
 * Shared avatar-image upload helpers.
 *
 * The `avatars` bucket policy `avatars_owner_insert` requires every object name to
 * start with `${auth.uid()}-avatar-`, which is why callers build flat, prefixed
 * filenames instead of user folders. Server icons reuse the same bucket and prefix.
 */
export const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'])
export const MAX_AVATAR_SOURCE_SIZE_BYTES = 20 * 1024 * 1024
export const MAX_AVATAR_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024

export function assertAvatarFile(file, { maxBytes = MAX_AVATAR_UPLOAD_SIZE_BYTES } = {}) {
  if (!file) throw new Error('Choose an image first.')
  if (!ALLOWED_AVATAR_TYPES.has((file.type || '').toLowerCase())) throw new Error('Image must be JPG, PNG, GIF, WebP, or AVIF.')
  if (file.size > maxBytes) throw new Error(`Image must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller.`)
  return file
}

/** Bucket-legal object name for an avatar-style upload owned by `userId`. */
export function avatarObjectName(userId, file, suffix = '') {
  const fileExt = /\.([a-z0-9]{2,5})$/i.exec(file.name || '')?.[1] || 'webp'
  return `${userId}-avatar-${suffix}${crypto.randomUUID()}.${fileExt.toLowerCase()}`
}

/** Object name inside `avatars` for a public URL we minted, or null if it isn't one. */
export function avatarObjectNameFromUrl(url) {
  const match = /\/storage\/v1\/object\/public\/avatars\/([^?#]+)/.exec(url || '')
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Best-effort cleanup of a replaced picture. Only the uploader may delete
 * (`avatars_owner_delete` checks owner_id), so a second admin replacing a
 * server icon simply cannot — a leftover object beats a failed save, so the
 * error is swallowed rather than surfaced.
 */
export async function deleteAvatarImage(supabase, url) {
  const fileName = avatarObjectNameFromUrl(url)
  if (!fileName) return
  try {
    await supabase.storage.from('avatars').remove([fileName])
  } catch (_err) { /* nothing the user can do about it */ }
}

/** Validates, uploads to the public `avatars` bucket, and returns the public URL. */
export async function uploadAvatarImage(supabase, file, fileName) {
  assertAvatarFile(file)
  const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false
  })
  if (uploadError) throw uploadError
  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
  return publicUrl
}
