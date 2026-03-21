import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pruneCache, cacheMessage, cacheThumbnail, getCachedMessages, getThumbnails } from '../cacheManager.js'

describe('cacheManager - pruneCache', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('removes oldest items when cache size exceeds maxStored', () => {
    // Generate a payload that will exceed a low maxStored limit
    const largeMessage = 'A'.repeat(100)
    const roomId = 'room-1'

    // We'll pass a mock cache object instead of relying entirely on localStorage
    // to give us more control over the test
    let cache = { messages: {}, thumbs: {} }

    // Create some initial messages
    cache.messages[roomId] = [
      { id: 1, text: largeMessage, createdAt: 1000 },
      { id: 2, text: largeMessage, createdAt: 2000 },
      { id: 3, text: largeMessage, createdAt: 3000 }
    ]

    // Create some initial thumbnails
    cache.thumbs[roomId] = [
      { dataUrl: 'data:image/jpeg;base64,A...', createdAt: 1500 },
      { dataUrl: 'data:image/jpeg;base64,B...', createdAt: 2500 }
    ]

    // Calculate size of current cache
    const initialSize = JSON.stringify(cache).length

    // Prune cache with a maxStored that is smaller than the initial size
    // We set it to just keep the newest message and thumbnail
    const maxStored = Math.floor(initialSize / 2)

    const prunedCache = pruneCache(cache, maxStored)

    // It should have removed some of the oldest items
    // Since oldest are removed first:
    // 1000 (msg 1), 1500 (thumb 1), 2000 (msg 2), 2500 (thumb 2), 3000 (msg 3)

    // The size of the pruned cache should be <= maxStored (unless a single item is larger than maxStored)
    expect(JSON.stringify(prunedCache).length).toBeLessThanOrEqual(maxStored)

    // Check that the oldest message (createdAt: 1000) was removed
    expect(prunedCache.messages[roomId].find(m => m.id === 1)).toBeUndefined()

    // Check that the newest message (createdAt: 3000) was kept
    expect(prunedCache.messages[roomId].find(m => m.id === 3)).toBeDefined()
  })

  it('removes entire room entry if all its items are pruned', () => {
    let cache = {
      messages: {
        'room-old': [
          { id: 1, text: 'old', createdAt: 1000 }
        ],
        'room-new': [
          { id: 2, text: 'new', createdAt: 5000 }
        ]
      },
      thumbs: {
        'room-old': [
          { dataUrl: 'data:old', createdAt: 1500 }
        ]
      }
    }

    // Prune with a very small maxStored so it has to remove the old room entirely
    const maxStored = JSON.stringify({
      messages: { 'room-new': [{ id: 2, text: 'new', createdAt: 5000 }] },
      thumbs: {}
    }).length

    const prunedCache = pruneCache(cache, maxStored)

    // The entire room-old entry should be removed from both messages and thumbs
    expect(prunedCache.messages['room-old']).toBeUndefined()
    expect(prunedCache.thumbs['room-old']).toBeUndefined()

    // The room-new entry should still exist
    expect(prunedCache.messages['room-new']).toBeDefined()
  })

  it('handles empty caches without errors', () => {
    const cache = { messages: {}, thumbs: {} }
    const prunedCache = pruneCache(cache, 1000)

    expect(prunedCache).toEqual({ messages: {}, thumbs: {} })
  })

  it('keeps cache unmodified if size is under maxStored', () => {
    const cache = {
      messages: {
        'room-1': [{ id: 1, text: 'msg', createdAt: 1000 }]
      },
      thumbs: {}
    }

    const initialSize = JSON.stringify(cache).length
    const prunedCache = pruneCache(cache, initialSize + 1000)

    expect(prunedCache.messages['room-1'].length).toBe(1)
  })
})
