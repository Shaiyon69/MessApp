const STORAGE_KEY = 'messapp-cache-v1'
const DEFAULT_MAX_ITEMS = 300

function getCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { messages: {}, thumbs: {} }
  } catch {
    return { messages: {}, thumbs: {} }
  }
}

function persistCache(cache) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
}

export function cacheMessage(roomId, message) {
  const cache = getCache()
  if (!cache.messages[roomId]) cache.messages[roomId] = []
  cache.messages[roomId].push(message)
  if (cache.messages[roomId].length > DEFAULT_MAX_ITEMS) {
    cache.messages[roomId] = cache.messages[roomId].slice(-DEFAULT_MAX_ITEMS)
  }
  pruneCache(cache)
  persistCache(cache)
}

export function getCachedMessages(roomId) {
  const cache = getCache()
  return cache.messages[roomId] || []
}

export function cacheThumbnail(roomId, thumbDataUrl) {
  const cache = getCache()
  if (!cache.thumbs[roomId]) cache.thumbs[roomId] = []
  cache.thumbs[roomId].push({ dataUrl: thumbDataUrl, createdAt: Date.now() })
  pruneCache(cache)
  persistCache(cache)
}

export function getThumbnails(roomId) {
  return getCache().thumbs[roomId] || []
}

export function pruneCache(cache = null, maxStored = 1000000) {
  const current = cache || getCache()
  const entries = []
  Object.entries(current.messages).forEach(([roomId, msgs]) => {
    msgs.forEach((msg) => entries.push({ roomId, type: 'msg', createdAt: msg.createdAt || Date.now() }))
  })
  Object.entries(current.thumbs).forEach(([roomId, thumbs]) => {
    thumbs.forEach((thumb) => entries.push({ roomId, type: 'thumb', createdAt: thumb.createdAt }))
  })

  entries.sort((a, b) => b.createdAt - a.createdAt)

  let total = JSON.stringify(current).length
  while (entries.length > 0 && total > maxStored) {
    const drop = entries.pop()
    if (drop.type === 'msg') {
      current.messages[drop.roomId] = current.messages[drop.roomId].slice(1)
      if (current.messages[drop.roomId].length === 0) delete current.messages[drop.roomId]
    } else {
      current.thumbs[drop.roomId] = current.thumbs[drop.roomId].slice(1)
      if (current.thumbs[drop.roomId].length === 0) delete current.thumbs[drop.roomId]
    }
    total = JSON.stringify(current).length
  }

  persistCache(current)
  return current
}
