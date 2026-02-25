import pako from 'pako';

const MAX_URL_BYTES = 2000;

export function encodeCode(code: string): string {
  const compressed = pako.deflate(new TextEncoder().encode(code));
  return btoa(String.fromCharCode(...compressed));
}

export function decodeCode(encoded: string): string | null {
  if (!encoded) return null;
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const decompressed = pako.inflate(bytes);
    return new TextDecoder().decode(decompressed);
  } catch {
    return null;
  }
}

export function isCodeTooLarge(code: string): boolean {
  const encoded = encodeCode(code);
  return encoded.length > MAX_URL_BYTES;
}
