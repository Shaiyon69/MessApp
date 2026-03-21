import { describe, it } from 'node:test'
import assert from 'node:assert'
import { encryptBinaryAesGcm, decryptBinaryAesGcm } from './crypto.js'

describe('encryptBinaryAesGcm', () => {
  it('should encrypt an ArrayBuffer and return iv and ciphertext as base64 strings', async () => {
    // Generate an AES-GCM key
    const key = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    )

    // Create a dummy ArrayBuffer
    const data = new Uint8Array([1, 2, 3, 4, 5]).buffer

    // Encrypt the ArrayBuffer
    const encrypted = await encryptBinaryAesGcm(key, data)

    // Assert the returned object contains iv and ciphertext
    assert.ok(encrypted.iv, 'Should return an iv')
    assert.ok(encrypted.ciphertext, 'Should return ciphertext')

    // Assert that iv and ciphertext are base64 strings
    assert.strictEqual(typeof encrypted.iv, 'string', 'IV should be a string')
    assert.strictEqual(typeof encrypted.ciphertext, 'string', 'Ciphertext should be a string')
    // A rudimentary check for base64: length is a multiple of 4, or it's just a valid string
    assert.match(encrypted.iv, /^[A-Za-z0-9+/=]+$/, 'IV should be base64 encoded')
    assert.match(encrypted.ciphertext, /^[A-Za-z0-9+/=]+$/, 'Ciphertext should be base64 encoded')
  })

  it('should be able to be decrypted back to the original ArrayBuffer', async () => {
    const key = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    )

    const originalArray = [10, 20, 30, 40, 50]
    const data = new Uint8Array(originalArray).buffer

    // Encrypt the data
    const encrypted = await encryptBinaryAesGcm(key, data)

    // Decrypt the data
    const decryptedBuffer = await decryptBinaryAesGcm(key, encrypted)

    // Assert the decrypted data matches the original data
    const decryptedArray = Array.from(new Uint8Array(decryptedBuffer))
    assert.deepStrictEqual(decryptedArray, originalArray, 'Decrypted data should match original data')
  })
})
