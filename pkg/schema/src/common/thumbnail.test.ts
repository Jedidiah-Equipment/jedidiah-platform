import { describe, expect, it } from 'vitest';

import { NullableThumbnailDataUrl, THUMBNAIL_DATA_URL_MAX_BYTES, ThumbnailDataUrl } from './thumbnail.js';

const VALID_JPEG = `data:image/jpeg;base64,${'a'.repeat(16)}`;
const VALID_WEBP = `data:image/webp;base64,${'a'.repeat(16)}`;

describe('ThumbnailDataUrl', () => {
  it('accepts bounded JPEG and WebP data URLs', () => {
    expect(ThumbnailDataUrl.parse(VALID_JPEG)).toBe(VALID_JPEG);
    expect(ThumbnailDataUrl.parse(VALID_WEBP)).toBe(VALID_WEBP);
    expect(NullableThumbnailDataUrl.parse(null)).toBeNull();
  });

  it('rejects remote URLs, SVG, unsupported MIME types, malformed payloads, and oversized values', () => {
    expect(() => ThumbnailDataUrl.parse('https://example.com/thumb.jpg')).toThrow();
    expect(() => ThumbnailDataUrl.parse('data:image/svg+xml;base64,aaaa')).toThrow();
    expect(() => ThumbnailDataUrl.parse('data:image/png;base64,aaaa')).toThrow();
    expect(() => ThumbnailDataUrl.parse('data:image/jpeg;base64,aaa')).toThrow();
    expect(() =>
      ThumbnailDataUrl.parse(`data:image/webp;base64,${'a'.repeat(THUMBNAIL_DATA_URL_MAX_BYTES)}`),
    ).toThrow();
  });
});
