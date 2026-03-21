import { describe, it, expect, beforeAll } from 'vitest'
import { encryptWithAesGcm, decryptWithAesGcm, toBase64 } from './crypto.js'

describe('AES-GCM encryption and decryption', () => {
  let key
  let anotherKey

  beforeAll(async () => {
    // Generate an AES-GCM key for testing
    key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )

    anotherKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )
  })

  it('should encrypt and decrypt data correctly', async () => {
    const originalText = 'Hello, this is a secret message! 🔒'
    const encrypted = await encryptWithAesGcm(key, originalText)

    expect(encrypted).toHaveProperty('iv')
    expect(encrypted).toHaveProperty('ciphertext')

    const decrypted = await decryptWithAesGcm(key, encrypted)
    expect(decrypted).toBe(originalText)
  })

  it('should throw an error when trying to decrypt with a different key', async () => {
    const originalText = 'This should not be readable with another key'
    const encrypted = await encryptWithAesGcm(key, originalText)

    await expect(decryptWithAesGcm(anotherKey, encrypted)).rejects.toThrow()
  })

  it('should throw an error when ciphertext is tampered with', async () => {
    const originalText = 'Tamper-proof message'
    const encrypted = await encryptWithAesGcm(key, originalText)

    // Tamper with the ciphertext: decode base64, flip a bit, encode again
    const binary = atob(encrypted.ciphertext)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }

    // Flip a bit in the ciphertext (avoiding the auth tag at the end might be tricky,
    // so just changing a random byte in the middle)
    bytes[Math.floor(bytes.length / 2)] ^= 1

    const tamperedCiphertext = toBase64(bytes.buffer)

    const tamperedEncrypted = {
      ...encrypted,
      ciphertext: tamperedCiphertext
    }

    await expect(decryptWithAesGcm(key, tamperedEncrypted)).rejects.toThrow()
  })
})
