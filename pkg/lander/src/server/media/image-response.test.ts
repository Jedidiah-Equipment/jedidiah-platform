import type { StoredObject } from '@pkg/core';
import { describe, expect, test } from 'vitest';

import { imageResponse } from './image-response.js';

async function* bytesOf(...chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('imageResponse', () => {
  test('streams a stored object with its content-type and a long cache', async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const object: StoredObject = { body: bytesOf(payload), byteSize: payload.byteLength, contentType: 'image/png' };

    const response = imageResponse(object);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe('4');
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600, stale-while-revalidate=86400');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(payload);
  });

  test('falls back to the neutral placeholder with a short cache when there is no image', async () => {
    const response = imageResponse(null);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await response.text()).toContain('JEDIDIAH');
  });
});
