import { describe, it, expect } from 'vitest'
import { toBase64 } from '../crypto.js'

describe('toBase64', () => {
  it('should convert standard bytes to base64 correctly', () => {
    // "Hello" -> [72, 101, 108, 108, 111] -> "SGVsbG8="
    const bytes = new Uint8Array([72, 101, 108, 108, 111])
    expect(toBase64(bytes)).toBe('SGVsbG8=')
  })

  it('should handle an empty array gracefully', () => {
    const bytes = new Uint8Array([])
    expect(toBase64(bytes)).toBe('')
  })

  it('should handle a large array', () => {
    // 1MB array
    const size = 1048576;
    const bytes = new Uint8Array(size);
    // Fill with 'A' (65)
    for (let i=0; i<size; i++) bytes[i] = 65;

    let result;
    expect(() => {
      result = toBase64(bytes);
    }).not.toThrow();

    // The resulting string length should be exactly 4 * ceil(size / 3) = 4 * 349526 = 1398104
    expect(result.length).toBe(1398104);
  })
})
