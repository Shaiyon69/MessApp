import { test, describe } from 'node:test';
import assert from 'node:assert';
import { fromBase64 } from './crypto.js';

describe('fromBase64', () => {
  test('converts basic base64 string to ArrayBuffer', () => {
    // "Hello World" -> "SGVsbG8gV29ybGQ="
    const base64Str = btoa('Hello World');
    const buffer = fromBase64(base64Str);
    const bytes = new Uint8Array(buffer);
    const expectedBytes = new TextEncoder().encode('Hello World');
    assert.deepStrictEqual(bytes, expectedBytes);
  });

  test('converts empty string to empty ArrayBuffer', () => {
    const buffer = fromBase64('');
    const bytes = new Uint8Array(buffer);
    assert.strictEqual(bytes.length, 0);
  });

  test('converts base64 with padding to ArrayBuffer', () => {
    // "Hello" -> "SGVsbG8=" (1 padding character)
    const base64Str = btoa('Hello');
    const buffer = fromBase64(base64Str);
    const bytes = new Uint8Array(buffer);
    const expectedBytes = new TextEncoder().encode('Hello');
    assert.deepStrictEqual(bytes, expectedBytes);
  });

  test('converts base64 with multiple padding characters to ArrayBuffer', () => {
    // "Hell" -> "SGVsbA==" (2 padding characters)
    const base64Str = btoa('Hell');
    const buffer = fromBase64(base64Str);
    const bytes = new Uint8Array(buffer);
    const expectedBytes = new TextEncoder().encode('Hell');
    assert.deepStrictEqual(bytes, expectedBytes);
  });

  test('converts base64 with binary data to ArrayBuffer', () => {
    const originalBytes = new Uint8Array([0, 255, 127, 128, 1, 2, 3]);
    const binString = String.fromCharCode(...originalBytes);
    const base64Str = btoa(binString);

    const buffer = fromBase64(base64Str);
    const bytes = new Uint8Array(buffer);

    assert.deepStrictEqual(bytes, originalBytes);
  });
});
