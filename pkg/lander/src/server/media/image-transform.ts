// The single optimized variant the Lander serves for every catalog image. One universal size covers the
// card grid, the detail hero, and the og:image tag (ADR 0007): downscaling a multi-thousand-pixel source
// to this width is where the payload win comes from. Kept as constants — there is no per-request sizing.
//
// This module is deliberately dependency-free (no sharp): the cache-busting URL helper folds
// TRANSFORM_SIGNATURE into every image URL so a transform change invalidates browser/CDN caches, and it must
// not drag the native image encoder into the catalog data layer.
export const OPTIMIZED_MAX_WIDTH = 1280;
export const OPTIMIZED_QUALITY = 80;
export const OPTIMIZED_CONTENT_TYPE = 'image/webp';

// Identifies the exact transform that produced a set of bytes. It is folded into both the on-disk cache key
// (so a cached file is only reused for the transform that made it) and the public image URL's `?v=` token
// (so browsers/CDNs holding a year-long `immutable` copy re-fetch after the transform changes). Bump it by
// changing any constant above.
export const TRANSFORM_SIGNATURE = `w${OPTIMIZED_MAX_WIDTH}-webp-q${OPTIMIZED_QUALITY}`;
