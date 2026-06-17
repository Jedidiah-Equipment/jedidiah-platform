import { describe, expect, it } from 'vitest';

import {
  NullableRangeImageDataUrl,
  ProductRangeCreateInput,
  ProductRangeUpdateInput,
  RANGE_IMAGE_DATA_URL_MAX_BYTES,
  RangeImageDataUrl,
} from './product-range.js';

const VALID_JPEG = `data:image/jpeg;base64,${'a'.repeat(16)}`;
const VALID_PNG = `data:image/png;base64,${'a'.repeat(16)}`;
const VALID_WEBP = `data:image/webp;base64,${'a'.repeat(16)}`;

describe('RangeImageDataUrl', () => {
  it('accepts bounded JPEG and PNG data URLs and allows null through the nullable type', () => {
    expect(RangeImageDataUrl.parse(VALID_JPEG)).toBe(VALID_JPEG);
    expect(RangeImageDataUrl.parse(VALID_PNG)).toBe(VALID_PNG);
    expect(NullableRangeImageDataUrl.parse(null)).toBeNull();
  });

  it('rejects remote URLs, WebP, unsupported MIME types, malformed payloads, and oversized values', () => {
    expect(() => RangeImageDataUrl.parse('https://example.com/range.jpg')).toThrow();
    expect(() => RangeImageDataUrl.parse(VALID_WEBP)).toThrow();
    expect(() => RangeImageDataUrl.parse('data:image/svg+xml;base64,aaaa')).toThrow();
    expect(() => RangeImageDataUrl.parse('data:image/jpeg;base64,aaa')).toThrow();
    expect(() =>
      RangeImageDataUrl.parse(`data:image/png;base64,${payloadForBytes(RANGE_IMAGE_DATA_URL_MAX_BYTES + 1)}`),
    ).toThrow();
  });
});

function payloadForBytes(byteLength: number): string {
  const fullTriplets = Math.floor(byteLength / 3);
  const remainder = byteLength % 3;

  if (remainder === 1) {
    return `${'a'.repeat(fullTriplets * 4)}aa==`;
  }

  if (remainder === 2) {
    return `${'a'.repeat(fullTriplets * 4)}aaa=`;
  }

  return 'a'.repeat(fullTriplets * 4);
}

describe('ProductRange inputs', () => {
  it('defaults create images to null but requires update image intent', () => {
    expect(ProductRangeCreateInput.parse({ name: 'Example Range' })).toEqual({
      imageDataUrl: null,
      name: 'Example Range',
    });

    expect(() =>
      ProductRangeUpdateInput.parse({
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Example Range',
      }),
    ).toThrow();

    expect(
      ProductRangeUpdateInput.parse({
        id: '00000000-0000-4000-8000-000000000001',
        imageDataUrl: null,
        name: 'Example Range',
      }),
    ).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      imageDataUrl: null,
      name: 'Example Range',
    });
  });
});
