import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getCachedMessages, getThumbnails, cacheMessage } from '../cacheManager.js'

const STORAGE_KEY = 'messapp-cache-v1'

describe('cacheManager', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('getCache edge cases', () => {
    it('returns default cache when localStorage is empty (null)', () => {
      // localStorage is empty (getItem returns null)
      const messages = getCachedMessages('room-1')
      expect(messages).toEqual([])

      const thumbs = getThumbnails('room-1')
      expect(thumbs).toEqual([])
    })

    it('returns default cache when localStorage contains invalid JSON', () => {
      // Set invalid JSON to trigger the catch block in JSON.parse
      localStorage.setItem(STORAGE_KEY, '{invalid_json,')

      const messages = getCachedMessages('room-1')
      expect(messages).toEqual([])
    })

    it('returns valid cache when localStorage contains valid JSON', () => {
      const mockData = {
        messages: {
          'room-1': [{ id: 1, text: 'hello' }]
        },
        thumbs: {}
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockData))

      const messages = getCachedMessages('room-1')
      expect(messages).toEqual([{ id: 1, text: 'hello' }])
    })

    it('handles corrupted storage gracefully and can recover when writing new data', () => {
      // Set completely corrupted data
      localStorage.setItem(STORAGE_KEY, 'corrupt data')

      // Should not throw, should return empty array
      expect(getCachedMessages('room-2')).toEqual([])

      // Now caching a message should work and overwrite the corrupt data
      cacheMessage('room-2', { id: 2, text: 'new msg' })

      expect(getCachedMessages('room-2')).toEqual([{ id: 2, text: 'new msg' }])

      // Verify localStorage was updated correctly
      const raw = localStorage.getItem(STORAGE_KEY)
      const parsed = JSON.parse(raw)
      expect(parsed.messages['room-2']).toEqual([{ id: 2, text: 'new msg' }])
    })
  })
})
