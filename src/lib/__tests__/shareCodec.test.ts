import { describe, it, expect } from 'vitest';
import { encodeCode, decodeCode, isCodeTooLarge } from '../shareCodec';

describe('shareCodec', () => {
  it('round-trips simple code', () => {
    const code = '#include <iostream>\nint main() { return 0; }';
    const encoded = encodeCode(code);
    expect(decodeCode(encoded)).toBe(code);
  });

  it('round-trips code with special characters', () => {
    const code = 'std::cout << "Hello\\n" << std::endl;';
    const encoded = encodeCode(code);
    expect(decodeCode(encoded)).toBe(code);
  });

  it('round-trips empty string', () => {
    expect(decodeCode(encodeCode(''))).toBe('');
  });

  it('returns null for invalid encoded data', () => {
    expect(decodeCode('not-valid-data!!!')).toBeNull();
  });

  it('returns null for empty string decode', () => {
    expect(decodeCode('')).toBeNull();
  });

  it('detects code too large for URL', () => {
    const smallCode = 'int main() {}';
    expect(isCodeTooLarge(smallCode)).toBe(false);

    // Use pseudo-random incompressible data so pako can't shrink it below 2000 bytes
    let largeCode = '';
    for (let i = 0; i < 5000; i++) {
      largeCode += String.fromCharCode(32 + (((i * 31337) ^ (i >> 3)) % 95));
    }
    expect(isCodeTooLarge(largeCode)).toBe(true);
  });
});
