import { describe, it, expect } from 'vitest'
import { generateEcdhKeyPair, exportPublicKey, importPublicKey } from './crypto.js'

describe('exportPublicKey', () => {
  it('should successfully export a valid ECDH public key to JWK format', async () => {
    const keyPair = await generateEcdhKeyPair()
    const jwk = await exportPublicKey(keyPair.publicKey)

    expect(jwk).toBeDefined()
    expect(jwk).toBeTypeOf('object')
    expect(jwk.kty).toBe('EC')
    expect(jwk.crv).toBe('P-256')
    expect(jwk.x).toBeTypeOf('string')
    expect(jwk.y).toBeTypeOf('string')
    expect(jwk.ext).toBe(true)
  })

  it('should fail when exporting a non-extractable or invalid key', async () => {
    // Pass null or undefined instead of a CryptoKey
    await expect(exportPublicKey(null)).rejects.toThrow()
    await expect(exportPublicKey(undefined)).rejects.toThrow()
    await expect(exportPublicKey('not-a-key')).rejects.toThrow()
  })

  it('should export a public key that can be successfully imported back', async () => {
    const keyPair = await generateEcdhKeyPair()
    const jwk = await exportPublicKey(keyPair.publicKey)

    // Test that the exported JWK is valid enough for importPublicKey
    const importedKey = await importPublicKey(jwk)
    expect(importedKey).toBeDefined()
    expect(importedKey.type).toBe('public')
    expect(importedKey.algorithm.name).toBe('ECDH')
    expect(importedKey.algorithm.namedCurve).toBe('P-256')
    expect(importedKey.extractable).toBe(true)
  })
})
