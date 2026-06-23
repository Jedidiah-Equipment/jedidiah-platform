import type { StoredObject } from '@pkg/core';

import { PLACEHOLDER_CONTENT_TYPE, PLACEHOLDER_SVG } from './placeholder.js';

// These routes are keyed by entity id, not by content, so an image replacement reuses the same URL. The
// cache is therefore long-but-revalidating rather than `immutable`: caches may serve a cached image for an
// hour, then refresh in the background, so a replaced image converges within ~an hour instead of being
// pinned to stale bytes for up to a year. A missing image is transient — an upload may follow — so its
// placeholder is cached only briefly, letting newly-added imagery appear quickly.
const IMAGE_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';
const PLACEHOLDER_CACHE_CONTROL = 'public, max-age=60';

// Turn a stored object (or its absence) into an HTTP image response. A null object yields the neutral
// brand placeholder with a 200 so consumers never see a broken image.
export function imageResponse(object: StoredObject | null): Response {
  if (!object) {
    return new Response(PLACEHOLDER_SVG, {
      status: 200,
      headers: { 'cache-control': PLACEHOLDER_CACHE_CONTROL, 'content-type': PLACEHOLDER_CONTENT_TYPE },
    });
  }

  return new Response(toReadableStream(object.body), {
    status: 200,
    headers: {
      'cache-control': IMAGE_CACHE_CONTROL,
      'content-length': String(object.byteSize),
      'content-type': object.contentType,
    },
  });
}

function toReadableStream(body: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> {
  const iterator = body[Symbol.asyncIterator]();

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await iterator.next();

      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}
