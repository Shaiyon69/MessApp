import { describe, it, expect } from 'vitest'
import { generateEcdhKeyPair } from './crypto.js'

describe('generateEcdhKeyPair', () => {
  it('should return a CryptoKeyPair with valid ECDH properties', async () => {
    const keyPair = await generateEcdhKeyPair()

    // Verify it returns an object with publicKey and privateKey
    expect(keyPair).toBeDefined()
    expect(keyPair.publicKey).toBeDefined()
    expect(keyPair.privateKey).toBeDefined()

    // Verify properties of the public key
    expect(keyPair.publicKey.type).toBe('public')
    expect(keyPair.publicKey.extractable).toBe(true)
    expect(keyPair.publicKey.algorithm.name).toBe('ECDH')
    expect(keyPair.publicKey.algorithm.namedCurve).toBe('P-256')
    expect(keyPair.publicKey.usages).toEqual([])

    // Verify properties of the private key
    expect(keyPair.privateKey.type).toBe('private')
    expect(keyPair.privateKey.extractable).toBe(true)
    expect(keyPair.privateKey.algorithm.name).toBe('ECDH')
    expect(keyPair.privateKey.algorithm.namedCurve).toBe('P-256')
    expect(keyPair.privateKey.usages).toEqual(['deriveKey'])
  })
})
