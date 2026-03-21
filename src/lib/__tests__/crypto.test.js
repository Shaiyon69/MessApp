import { describe, it, expect, vi } from 'vitest'
import { fingerprintKey } from '../crypto'

describe('fingerprintKey', () => {
  it('should generate a correctly formatted fingerprint from a CryptoKey', async () => {
    // Generate a real key to test with
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    )

    const fingerprint = await fingerprintKey(keyPair.publicKey)

    // Verify format: hex pairs separated by colons, 12 characters total (excluding colons)
    // Format: "xxxx:xxxx:xxxx"
    expect(typeof fingerprint).toBe('string')
    expect(fingerprint).toMatch(/^[0-9a-f]{4}:[0-9a-f]{4}:[0-9a-f]{4}$/)
  })

  it('should generate deterministic fingerprints for the same key data', async () => {
    // Mock the crypto API to return deterministic values
    const originalExportKey = crypto.subtle.exportKey
    const originalDigest = crypto.subtle.digest

    try {
      // Create a deterministic dummy array buffer to represent exported key
      const dummyRawKey = new Uint8Array([1, 2, 3, 4]).buffer

      // Create a deterministic hash array buffer (16 bytes, we only use first 6 for 12 hex chars)
      const dummyHash = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88
      ]).buffer

      crypto.subtle.exportKey = vi.fn().mockResolvedValue(dummyRawKey)
      crypto.subtle.digest = vi.fn().mockResolvedValue(dummyHash)

      // Need an object with an empty internal slot representing a CryptoKey
      // or vi.mock won't accept the original functions
      const dummyKey = { type: 'public', extractable: true, algorithm: { name: 'ECDH' }, usages: [] }
      const fingerprint = await fingerprintKey(dummyKey)

      expect(crypto.subtle.exportKey).toHaveBeenCalledWith('raw', dummyKey)
      expect(crypto.subtle.digest).toHaveBeenCalledWith('SHA-256', dummyRawKey)

      // Expected: "1234:5678:9abc"
      expect(fingerprint).toBe('1234:5678:9abc')
    } finally {
      // Restore original implementations
      crypto.subtle.exportKey = originalExportKey
      crypto.subtle.digest = originalDigest
    }
  })
})
