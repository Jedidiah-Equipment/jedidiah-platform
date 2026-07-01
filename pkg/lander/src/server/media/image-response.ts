import type { OptimizedImage } from './image-cache.js';
import { PLACEHOLDER_CONTENT_TYPE, PLACEHOLDER_SVG } from './placeholder.js';

// A real image URL always carries the `?v=` file-`updatedAt` token (see products-data `imageUrl`), and a
// replacement changes that token, so a versioned URL's bytes are effectively immutable — cache them for a
// year and never revalidate. A request without `?v=` (a bare URL hit directly) might serve different bytes
// after a replacement, so it only gets the shorter revalidating window rather than being pinned.
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const REVALIDATE_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';
// A missing image is transient — an upload may follow — so its placeholder is cached only briefly, letting
// newly-added imagery appear quickly.
const PLACEHOLDER_CACHE_CONTROL = 'public, max-age=60';

// Turn an optimized image (or its absence) into an HTTP response. A null object yields the neutral brand
// placeholder with a 200 so consumers never see a broken image. `versioned` reflects whether the request
// carried the `?v=` cache-busting token and selects the long-vs-short cache window for real images.
export function imageResponse(object: OptimizedImage | null, { versioned }: { versioned: boolean }): Response {
  if (!object) {
    return new Response(PLACEHOLDER_SVG, {
      status: 200,
      headers: { 'cache-control': PLACEHOLDER_CACHE_CONTROL, 'content-type': PLACEHOLDER_CONTENT_TYPE },
    });
  }

  // Wrap the bytes in a Blob: the web Response body type does not accept a bare Uint8Array here. Copy into
  // a fresh Uint8Array so the body is backed by a plain (non-shared) ArrayBuffer the lib types want (mirrors
  // brochure-handlers).
  return new Response(new Blob([new Uint8Array(object.body)], { type: object.contentType }), {
    status: 200,
    headers: {
      'cache-control': versioned ? IMMUTABLE_CACHE_CONTROL : REVALIDATE_CACHE_CONTROL,
      'content-length': String(object.byteSize),
      'content-type': object.contentType,
    },
  });
}
