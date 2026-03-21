import { describe, it, expect, beforeAll } from 'vitest'
import { generateEcdhKeyPair, exportPublicKey, importPublicKey } from './crypto.js'

describe('importPublicKey', () => {
  let publicKeyJwk

  beforeAll(async () => {
    // Generate a valid key pair and export the public key to JWK to use in our tests
    const keyPair = await generateEcdhKeyPair()
    publicKeyJwk = await exportPublicKey(keyPair.publicKey)
  })

  it('should successfully import a valid ECDH P-256 JWK public key', async () => {
    const importedKey = await importPublicKey(publicKeyJwk)

    expect(importedKey).toBeDefined()
    expect(importedKey.type).toBe('public')
    expect(importedKey.extractable).toBe(true)
    expect(importedKey.algorithm.name).toBe('ECDH')
    expect(importedKey.algorithm.namedCurve).toBe('P-256')
    expect(importedKey.usages).toEqual([])
  })

  it('should reject importing an invalid JWK', async () => {
    const invalidJwk = { ...publicKeyJwk, x: 'invalid_base64url_data', y: 'invalid_base64url_data' }

    await expect(importPublicKey(invalidJwk)).rejects.toThrow()
  })

  it('should reject importing if the JWK format is entirely incorrect', async () => {
    const malformedJwk = { crv: 'P-256', kty: 'EC' } // Missing x and y

    await expect(importPublicKey(malformedJwk)).rejects.toThrow()
  })
})
