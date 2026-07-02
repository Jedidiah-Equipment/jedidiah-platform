// The optimized variants the Lander serves for every catalog image (ADR 0007): downscaling a
// multi-thousand-pixel source is where the payload win comes from. Each format carries its own size and
// quality: WebP is the site's own <img> variant (card grid, detail hero); JPEG is the og:image /
// twitter:image variant — social scrapers (Slack, WhatsApp, Facebook, LinkedIn) download WebP but refuse to
// render it as a preview card, and WhatsApp/Facebook additionally drop preview images over ~300 KB, so the
// JPEG variant is smaller and lossier to stay safely under that ceiling.
//
// This module is deliberately dependency-free (no sharp): the cache-busting URL helper folds the transform
// signature into every image URL so a transform change invalidates browser/CDN caches, and it must not drag
// the native image encoder into the catalog data layer.
export type OptimizedImageFormat = 'webp' | 'jpeg';

export const IMAGE_TRANSFORMS: Record<
  OptimizedImageFormat,
  { maxWidth: number; quality: number; contentType: string }
> = {
  webp: { maxWidth: 1280, quality: 80, contentType: 'image/webp' },
  jpeg: { maxWidth: 1024, quality: 75, contentType: 'image/jpeg' },
};

export const DEFAULT_IMAGE_FORMAT: OptimizedImageFormat = 'webp';
// The format for URL-valued head tags (og:image, twitter:image).
export const OG_IMAGE_FORMAT: OptimizedImageFormat = 'jpeg';

// Forgiving parse for the public route's `?format=` param: anything unrecognized falls back to the default,
// mirroring how an invalid `?slot=` falls back to `primary` — the public endpoint never 400s a crawler.
export function parseImageFormat(value: string | null | undefined): OptimizedImageFormat {
  return value === 'jpeg' ? 'jpeg' : DEFAULT_IMAGE_FORMAT;
}

// Identifies the exact transform that produced a set of bytes. It is folded into both the on-disk cache key
// (so a cached file is only reused for the transform that made it) and the public image URL's `?v=` token
// (so browsers/CDNs holding a year-long `immutable` copy re-fetch after the transform changes). Changing a
// format's parameters above yields a new signature for that format only.
export function transformSignature(format: OptimizedImageFormat): string {
  const transform = IMAGE_TRANSFORMS[format];

  return `w${transform.maxWidth}-${format}-q${transform.quality}`;
}
