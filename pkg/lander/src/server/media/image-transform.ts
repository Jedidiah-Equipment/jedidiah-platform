// The optimized variants the Lander serves for every catalog image. One universal size covers the card
// grid, the detail hero, and the og:image tag (ADR 0007): downscaling a multi-thousand-pixel source to this
// width is where the payload win comes from. Two formats share that size: WebP for the site's own <img>
// tags (best payload), JPEG for og:image/twitter:image — social scrapers (Slack, WhatsApp, Facebook,
// LinkedIn) download WebP but refuse to render it as a preview card.
//
// This module is deliberately dependency-free (no sharp): the cache-busting URL helper folds the transform
// signature into every image URL so a transform change invalidates browser/CDN caches, and it must not drag
// the native image encoder into the catalog data layer.
export const OPTIMIZED_MAX_WIDTH = 1280;
export const OPTIMIZED_QUALITY = 80;

export type OptimizedImageFormat = 'webp' | 'jpeg';

export const DEFAULT_IMAGE_FORMAT: OptimizedImageFormat = 'webp';
// The format for URL-valued head tags (og:image, twitter:image).
export const OG_IMAGE_FORMAT: OptimizedImageFormat = 'jpeg';

export const OPTIMIZED_CONTENT_TYPES: Record<OptimizedImageFormat, string> = {
  webp: 'image/webp',
  jpeg: 'image/jpeg',
};

// Forgiving parse for the public route's `?format=` param: anything unrecognized falls back to the default,
// mirroring how an invalid `?slot=` falls back to `primary` — the public endpoint never 400s a crawler.
export function parseImageFormat(value: string | null | undefined): OptimizedImageFormat {
  return value === 'jpeg' ? 'jpeg' : DEFAULT_IMAGE_FORMAT;
}

// Identifies the exact transform that produced a set of bytes. It is folded into both the on-disk cache key
// (so a cached file is only reused for the transform that made it) and the public image URL's `?v=` token
// (so browsers/CDNs holding a year-long `immutable` copy re-fetch after the transform changes). Changing
// any constant above yields new signatures.
export function transformSignature(format: OptimizedImageFormat): string {
  return `w${OPTIMIZED_MAX_WIDTH}-${format}-q${OPTIMIZED_QUALITY}`;
}
