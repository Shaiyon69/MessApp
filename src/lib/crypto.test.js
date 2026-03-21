import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { encryptBinaryAesGcm, decryptBinaryAesGcm } from './crypto.js'

describe('AES-GCM Binary Encryption/Decryption', () => {
  it('should encrypt and successfully decrypt an ArrayBuffer back to the exact original', async () => {
    // 1. Generate a test AES-GCM key
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )

    // 2. Create some sample binary data (ArrayBuffer)
    const originalData = new Uint8Array([1, 2, 3, 4, 5, 255, 128, 0, 42]).buffer

    // 3. Encrypt the binary data
    const encryptedObj = await encryptBinaryAesGcm(key, originalData)

    // Ensure it returned the expected format
    assert.ok(encryptedObj.iv, 'Encrypted object should have an iv')
    assert.ok(encryptedObj.ciphertext, 'Encrypted object should have a ciphertext')

    // 4. Decrypt the binary data
    const decryptedBuffer = await decryptBinaryAesGcm(key, encryptedObj)

    // Ensure it decrypted successfully into an ArrayBuffer
    assert.ok(decryptedBuffer instanceof ArrayBuffer, 'Decrypted data should be an ArrayBuffer')

    // 5. Compare the decrypted ArrayBuffer with the original ArrayBuffer
    const originalView = new Uint8Array(originalData)
    const decryptedView = new Uint8Array(decryptedBuffer)

    assert.equal(decryptedView.length, originalView.length, 'Decrypted buffer length should match original')

    for (let i = 0; i < originalView.length; i++) {
      assert.equal(decryptedView[i], originalView[i], `Byte at index ${i} should match`)
    }
  })
})
