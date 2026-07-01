import sharp from 'sharp';

// The single optimized variant the Lander serves for every catalog image. One universal size covers the
// card grid, the detail hero, and the og:image tag (ADR 0007): downscaling a multi-thousand-pixel source
// to this width is where the payload win comes from. Kept as constants — there is no per-request sizing.
export const OPTIMIZED_MAX_WIDTH = 1280;
export const OPTIMIZED_QUALITY = 80;
export const OPTIMIZED_CONTENT_TYPE = 'image/webp';

// Folded into the cache key so a cached variant is only reused for the exact transform that produced it.
// Bump (by changing any constant above) and old cached files simply stop matching — they are never served
// as if they were the new transform.
export const TRANSFORM_SIGNATURE = `w${OPTIMIZED_MAX_WIDTH}-webp-q${OPTIMIZED_QUALITY}`;

// Resize-down to WebP. `rotate()` bakes in EXIF orientation before the strip; `withoutEnlargement` leaves a
// source already narrower than the target untouched (still re-encoded to WebP, never upscaled). Throws on
// non-raster or corrupt input — the caller treats that as "serve the original bytes" rather than a failure.
export async function optimizeImage(bytes: Uint8Array): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize({ width: OPTIMIZED_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: OPTIMIZED_QUALITY })
    .toBuffer();
}
