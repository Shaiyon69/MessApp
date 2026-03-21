import { describe, it, expect } from 'vitest';
import { toBase64, fromBase64 } from './crypto.js';

describe('crypto toBase64', () => {
  it('should correctly convert a Uint8Array to base64', () => {
    // "Hello" in bytes
    const bytes = new Uint8Array([72, 101, 108, 108, 111]);
    const base64 = toBase64(bytes);
    expect(base64).toBe('SGVsbG8=');
  });

  it('should correctly convert an ArrayBuffer to base64', () => {
    // "World" in bytes
    const bytes = new Uint8Array([87, 111, 114, 108, 100]);
    const base64 = toBase64(bytes.buffer);
    expect(base64).toBe('V29ybGQ=');
  });

  it('should handle empty arrays', () => {
    const bytes = new Uint8Array([]);
    const base64 = toBase64(bytes);
    expect(base64).toBe('');
  });

  it('should handle all possible byte values', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      bytes[i] = i;
    }
    const base64 = toBase64(bytes);
    // Base64 of all 256 byte values
    const expected = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5fYGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn+AgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/w==';
    expect(base64).toBe(expected);
  });
});

describe('crypto fromBase64', () => {
  it('should correctly convert base64 to ArrayBuffer', () => {
    const base64 = 'SGVsbG8=';
    const buffer = fromBase64(base64);
    const bytes = new Uint8Array(buffer);

    expect(bytes.length).toBe(5);
    expect(bytes[0]).toBe(72);
    expect(bytes[1]).toBe(101);
    expect(bytes[2]).toBe(108);
    expect(bytes[3]).toBe(108);
    expect(bytes[4]).toBe(111);
  });
});
