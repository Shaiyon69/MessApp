import { describe, it, expect } from 'vitest';
import {
  generateEcdhKeyPair,
  exportPublicKey,
  deriveSharedAesKey,
  encryptWithAesGcm,
  decryptWithAesGcm
} from '../crypto.js';

describe('deriveSharedAesKey', () => {
  it('should derive the same shared AES key for two parties using ECDH', async () => {
    // 1. Generate Key Pairs for Alice and Bob
    const aliceKeyPair = await generateEcdhKeyPair();
    const bobKeyPair = await generateEcdhKeyPair();

    // 2. Export Public Keys as JWK
    const alicePublicKeyJwk = await exportPublicKey(aliceKeyPair.publicKey);
    const bobPublicKeyJwk = await exportPublicKey(bobKeyPair.publicKey);

    // 3. Alice derives shared key using her private key and Bob's public key
    const aliceSharedKey = await deriveSharedAesKey(
      aliceKeyPair.privateKey,
      bobPublicKeyJwk
    );

    // 4. Bob derives shared key using his private key and Alice's public key
    const bobSharedKey = await deriveSharedAesKey(
      bobKeyPair.privateKey,
      alicePublicKeyJwk
    );

    // Both keys should be valid CryptoKey objects for AES-GCM
    expect(aliceSharedKey).toBeInstanceOf(CryptoKey);
    expect(aliceSharedKey.algorithm.name).toBe('AES-GCM');
    expect(bobSharedKey).toBeInstanceOf(CryptoKey);
    expect(bobSharedKey.algorithm.name).toBe('AES-GCM');

    // 5. Verify they derived the same key by encrypting/decrypting a message
    const secretMessage = 'Hello Bob, this is a top secret message from Alice!';

    // Alice encrypts the message
    const encryptedData = await encryptWithAesGcm(aliceSharedKey, secretMessage);
    expect(encryptedData.iv).toBeDefined();
    expect(encryptedData.ciphertext).toBeDefined();

    // Bob decrypts the message
    const decryptedMessage = await decryptWithAesGcm(bobSharedKey, encryptedData);

    expect(decryptedMessage).toBe(secretMessage);
  });

  it('should throw an error if an invalid public key JWK is provided', async () => {
    const aliceKeyPair = await generateEcdhKeyPair();

    // Invalid JWK format
    const invalidJwk = {
      kty: 'EC',
      crv: 'P-256',
      x: 'invalid_x',
      y: 'invalid_y'
    };

    await expect(deriveSharedAesKey(aliceKeyPair.privateKey, invalidJwk)).rejects.toThrow();
  });
});
