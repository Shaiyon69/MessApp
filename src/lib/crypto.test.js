import test from 'node:test';
import assert from 'node:assert';
import { encryptWithAesGcm, decryptWithAesGcm } from './crypto.js';

test('decryptWithAesGcm should throw an error when decrypting with an incorrect key', async () => {
  const correctKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const incorrectKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const data = 'sensitive information';
  const encrypted = await encryptWithAesGcm(correctKey, data);

  await assert.rejects(
    async () => {
      await decryptWithAesGcm(incorrectKey, encrypted);
    },
    (err) => {
      assert.strictEqual(err.name, 'OperationError');
      return true;
    },
    'Should reject with OperationError when using incorrect key'
  );
});

test('decryptWithAesGcm should throw an error when ciphertext is modified', async () => {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const data = 'sensitive information';
  const encrypted = await encryptWithAesGcm(key, data);

  // Modify the ciphertext to simulate tampering
  const modifiedEncrypted = { ...encrypted };
  const ciphertextBuffer = Buffer.from(modifiedEncrypted.ciphertext, 'base64');
  ciphertextBuffer[0] ^= 1; // Flip the first bit
  modifiedEncrypted.ciphertext = ciphertextBuffer.toString('base64');

  await assert.rejects(
    async () => {
      await decryptWithAesGcm(key, modifiedEncrypted);
    },
    (err) => {
      assert.strictEqual(err.name, 'OperationError');
      return true;
    },
    'Should reject with OperationError when ciphertext is modified'
  );
});

test('decryptWithAesGcm should decrypt successfully with correct key and unmodified ciphertext', async () => {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const data = 'sensitive information';
  const encrypted = await encryptWithAesGcm(key, data);
  const decrypted = await decryptWithAesGcm(key, encrypted);

  assert.strictEqual(decrypted, data, 'Decrypted data should match original data');
});
