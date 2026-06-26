// Shared primitives for inline images stored as base64 data URLs (as opposed to the object-storage
// EntityFile shape in `file.ts`). Keep this file free of any single feature's format set or size
// cap; consumers compose these into their own branded scalar with the rules they need.

export type ImageDataUrlFormat = 'jpeg' | 'png' | 'webp';

// Matches `data:image/<format>;base64,<payload>` for the given formats, with an optional `=` / `==`
// base64 pad. The payload's length alignment is validated separately by {@link hasAlignedBase64Payload}.
export function buildImageDataUrlPattern(formats: readonly ImageDataUrlFormat[]): RegExp {
  return new RegExp(`^data:image/(${formats.join('|')});base64,[A-Za-z0-9+/]+={0,2}$`);
}

// True when the data URL carries a non-empty, 4-aligned base64 payload (a structurally decodable blob).
export function hasAlignedBase64Payload(value: string): boolean {
  const payload = getBase64Payload(value);

  return payload !== null && payload.length > 0 && payload.length % 4 === 0;
}

// Decoded size of the base64 payload in bytes, or +Infinity when the payload is missing or misaligned
// (so a single `<= maxBytes` check rejects malformed values too).
export function decodedBase64ByteLength(value: string): number {
  const payload = getBase64Payload(value);

  if (!payload || payload.length % 4 !== 0) {
    return Number.POSITIVE_INFINITY;
  }

  const paddingBytes = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;

  return (payload.length / 4) * 3 - paddingBytes;
}

function getBase64Payload(value: string): string | null {
  return value.split(',', 2)[1] ?? null;
}
