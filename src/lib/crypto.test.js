import { describe, it, expect, beforeAll } from 'vitest'
import { encryptWithAesGcm, decryptWithAesGcm } from './crypto.js'

describe('encryptWithAesGcm', () => {
  let aesKey

  beforeAll(async () => {
    // Generate a proper AES-GCM key for testing
    aesKey = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    )
  })

  it('should encrypt a string and return an object with iv and ciphertext strings', async () => {
    const data = 'hello world'
    const result = await encryptWithAesGcm(aesKey, data)

    expect(result).toBeDefined()
    expect(result.iv).toBeDefined()
    expect(typeof result.iv).toBe('string')
    expect(result.ciphertext).toBeDefined()
    expect(typeof result.ciphertext).toBe('string')
  })

  it('should allow the encrypted data to be decrypted back to the original string', async () => {
    const data = 'testing decryption process with a longer string'
    const encrypted = await encryptWithAesGcm(aesKey, data)

    const decrypted = await decryptWithAesGcm(aesKey, encrypted)
    expect(decrypted).toBe(data)
  })

  it('should produce different ciphertext for the same data due to random IV', async () => {
    const data = 'same data'
    const encrypted1 = await encryptWithAesGcm(aesKey, data)
    const encrypted2 = await encryptWithAesGcm(aesKey, data)

    expect(encrypted1.iv).not.toBe(encrypted2.iv)
    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext)
  })
})
