import { describe, it, expect, beforeEach } from 'vitest'
import { cacheMessage, getCachedMessages } from './cacheManager'

describe('cacheManager', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should store a single message for a specific roomId', () => {
    const roomId = 'room-1'
    const message = { id: 1, text: 'hello', createdAt: Date.now() }

    cacheMessage(roomId, message)

    const cached = getCachedMessages(roomId)
    expect(cached).toHaveLength(1)
    expect(cached[0]).toEqual(message)
  })

  it('should append multiple messages for the same roomId', () => {
    const roomId = 'room-1'
    const msg1 = { id: 1, text: 'hello', createdAt: Date.now() }
    const msg2 = { id: 2, text: 'world', createdAt: Date.now() }

    cacheMessage(roomId, msg1)
    cacheMessage(roomId, msg2)

    const cached = getCachedMessages(roomId)
    expect(cached).toHaveLength(2)
    expect(cached[0]).toEqual(msg1)
    expect(cached[1]).toEqual(msg2)
  })

  it('should cap the stored messages at DEFAULT_MAX_ITEMS (300)', () => {
    const roomId = 'room-cap'
    const DEFAULT_MAX_ITEMS = 300

    // Add 305 messages
    for (let i = 0; i < DEFAULT_MAX_ITEMS + 5; i++) {
      cacheMessage(roomId, { id: i, text: `msg-${i}`, createdAt: Date.now() + i })
    }

    const cached = getCachedMessages(roomId)
    expect(cached).toHaveLength(DEFAULT_MAX_ITEMS)
    // The first 5 messages (0 to 4) should be sliced off
    expect(cached[0].id).toBe(5)
    expect(cached[cached.length - 1].id).toBe(DEFAULT_MAX_ITEMS + 4)
  })

  it('should isolate messages between different roomIds', () => {
    const roomId1 = 'room-A'
    const roomId2 = 'room-B'

    const msgA = { id: 1, text: 'for A', createdAt: Date.now() }
    const msgB = { id: 2, text: 'for B', createdAt: Date.now() }

    cacheMessage(roomId1, msgA)
    cacheMessage(roomId2, msgB)

    const cachedA = getCachedMessages(roomId1)
    const cachedB = getCachedMessages(roomId2)

    expect(cachedA).toHaveLength(1)
    expect(cachedA[0]).toEqual(msgA)

    expect(cachedB).toHaveLength(1)
    expect(cachedB[0]).toEqual(msgB)
  })
})
