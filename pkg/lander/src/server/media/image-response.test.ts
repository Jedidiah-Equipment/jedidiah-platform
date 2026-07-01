import { describe, expect, test } from 'vitest';

import type { OptimizedImage } from './image-cache.js';
import { imageResponse } from './image-response.js';

function optimized(payload: Uint8Array): OptimizedImage {
  return { body: payload, byteSize: payload.byteLength, contentType: 'image/webp' };
}

describe('imageResponse', () => {
  test('serves an optimized image immutably when the request is versioned', async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);

    const response = imageResponse(optimized(payload), { versioned: true });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('content-length')).toBe('4');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(payload);
  });

  test('serves an optimized image with a revalidating cache when the request is unversioned', () => {
    const response = imageResponse(optimized(new Uint8Array([1])), { versioned: false });

    expect(response.headers.get('cache-control')).toBe('public, max-age=3600, stale-while-revalidate=86400');
  });

  test('falls back to the neutral placeholder with a short cache when there is no image', async () => {
    const response = imageResponse(null, { versioned: true });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    const body = await response.text();
    expect(body).toContain('<svg');
    expect(body).toContain('aria-label="Jedidiah Equipment"');
    // The neutral placeholder centres the white brand mark, inlined as a data URI.
    expect(body).toContain('<image href="data:image/png;base64,');
  });
});
