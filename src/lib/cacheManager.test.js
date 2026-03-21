import { describe, it, expect, beforeEach } from 'vitest'
import { getCachedMessages, cacheMessage } from './cacheManager.js'

describe('cacheManager - getCachedMessages', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should return an empty array if no messages are cached for the room', () => {
    const messages = getCachedMessages('room-1')
    expect(messages).toEqual([])
  })

  it('should return cached messages for a specific room', () => {
    const msg1 = { id: 1, text: 'Hello' }
    const msg2 = { id: 2, text: 'World' }

    cacheMessage('room-2', msg1)
    cacheMessage('room-2', msg2)

    const messages = getCachedMessages('room-2')
    expect(messages).toEqual([msg1, msg2])
  })

  it('should not return messages from a different room', () => {
    const msg = { id: 3, text: 'Test' }
    cacheMessage('room-3', msg)

    const messages = getCachedMessages('room-4')
    expect(messages).toEqual([])
  })

  it('should retrieve messages after manual localStorage manipulation', () => {
    const mockCache = {
      messages: {
        'room-5': [{ id: 4, text: 'Manual insert' }]
      },
      thumbs: {}
    }
    localStorage.setItem('messapp-cache-v1', JSON.stringify(mockCache))

    const messages = getCachedMessages('room-5')
    expect(messages).toEqual([{ id: 4, text: 'Manual insert' }])
  })
})
