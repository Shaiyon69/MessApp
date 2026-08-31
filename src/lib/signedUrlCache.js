/**
 * Memoizes Supabase Storage signed URLs by object path.
 *
 * A signed URL is minted per attachment every time a message list is hydrated —
 * initial load, every scrollback page, every realtime insert, every reaction
 * change. The URLs are valid for an hour, so re-minting them is a pure round
 * trip. Entries are retired early (SAFETY_MARGIN_MS) so a URL handed out here is
 * never on the verge of expiring, and the in-flight promise is cached too so a
 * page of duplicate requests collapses into one call.
 */

const SAFETY_MARGIN_MS = 5 * 60 * 1000

export function createSignedUrlCache() {
  return new Map()
}

export function getFreshSignedUrl(cache, objectPath, now = Date.now()) {
  const entry = cache.get(objectPath)
  if (!entry) return null
  if (entry.expiresAt <= now) {
    cache.delete(objectPath)
    return null
  }
  return entry.value
}

export function putSignedUrl(cache, objectPath, value, ttlSeconds, now = Date.now()) {
  const lifetimeMs = Math.max(ttlSeconds * 1000 - SAFETY_MARGIN_MS, 0)
  if (lifetimeMs === 0) return value
  cache.set(objectPath, { value, expiresAt: now + lifetimeMs })
  return value
}

/**
 * Returns a cached signed URL for `objectPath`, otherwise calls `mint` and
 * caches the promise it returns. A rejected mint is evicted so the next caller
 * retries rather than inheriting the failure.
 */
export function withSignedUrlCache(cache, objectPath, ttlSeconds, mint, now = Date.now()) {
  const cached = getFreshSignedUrl(cache, objectPath, now)
  if (cached) return cached
  const pending = Promise.resolve().then(mint).catch(error => {
    cache.delete(objectPath)
    throw error
  })
  return putSignedUrl(cache, objectPath, pending, ttlSeconds, now)
}
