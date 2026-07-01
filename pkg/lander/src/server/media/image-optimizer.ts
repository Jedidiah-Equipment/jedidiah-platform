import sharp from 'sharp';

import { OPTIMIZED_MAX_WIDTH, OPTIMIZED_QUALITY } from './image-transform.js';

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
