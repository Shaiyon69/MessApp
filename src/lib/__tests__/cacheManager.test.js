import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cacheMessage, getCachedMessages } from '../cacheManager'

describe('cacheManager', () => {
  const STORAGE_KEY = 'messapp-cache-v1'

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('should cache a message', () => {
    const roomId = 'room-1'
    const message = { id: 1, text: 'hello' }

    cacheMessage(roomId, message)

    const messages = getCachedMessages(roomId)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual(message)
  })

  it('should return empty array for empty room', () => {
    const roomId = 'room-empty'
    const messages = getCachedMessages(roomId)
    expect(messages).toEqual([])
  })

  it('should limit cached messages to DEFAULT_MAX_ITEMS (300)', () => {
    const roomId = 'room-limit'
    const DEFAULT_MAX_ITEMS = 300
    const TOTAL_MESSAGES = 350

    for (let i = 1; i <= TOTAL_MESSAGES; i++) {
      cacheMessage(roomId, { id: i, text: `message ${i}` })
    }

    const messages = getCachedMessages(roomId)

    // Check that we only kept DEFAULT_MAX_ITEMS messages
    expect(messages).toHaveLength(DEFAULT_MAX_ITEMS)

    // Check that the messages kept are the *latest* ones
    // Since we added 350 messages, we should keep messages 51 to 350
    expect(messages[0].id).toBe(TOTAL_MESSAGES - DEFAULT_MAX_ITEMS + 1)
    expect(messages[messages.length - 1].id).toBe(TOTAL_MESSAGES)
  })
})
