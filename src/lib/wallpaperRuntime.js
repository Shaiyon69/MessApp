export function getWallpaperScopeKey(roomId, path) {
  return roomId && path ? `${roomId}:${path}` : ''
}

export function getFreshWallpaperCacheEntry(cache, scopeKey, now = Date.now()) {
  const entry = cache?.get?.(scopeKey)
  return entry?.url && entry.expiresAt > now ? entry : null
}

export function resolveWallpaperUrl(cache, scopeKey, state, now = Date.now()) {
  if (!scopeKey) return ''
  if (state?.scopeKey === scopeKey) return state.url || ''
  return getFreshWallpaperCacheEntry(cache, scopeKey, now)?.url || ''
}

export function preloadWallpaperImage(url, ImageConstructor = globalThis.Image) {
  if (!url || typeof ImageConstructor !== 'function') return Promise.resolve(url || '')
  return new Promise((resolve, reject) => {
    const image = new ImageConstructor()
    image.onload = () => resolve(url)
    image.onerror = () => reject(new Error('Wallpaper image could not be loaded'))
    image.src = url
    if (typeof image.decode === 'function') {
      image.decode().then(() => resolve(url)).catch(() => {})
    }
  })
}
