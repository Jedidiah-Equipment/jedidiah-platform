import sharp from 'sharp';

import { OPTIMIZED_MAX_WIDTH, OPTIMIZED_QUALITY, type OptimizedImageFormat } from './image-transform.js';

// Resize-down to the requested format. `rotate()` bakes in EXIF orientation before the strip;
// `withoutEnlargement` leaves a source already narrower than the target untouched (still re-encoded, never
// upscaled). Throws on non-raster or corrupt input — the caller treats that as "serve the original bytes"
// rather than a failure.
export async function optimizeImage(bytes: Uint8Array, format: OptimizedImageFormat): Promise<Buffer> {
  const resized = sharp(bytes).rotate().resize({ width: OPTIMIZED_MAX_WIDTH, withoutEnlargement: true });

  return format === 'jpeg'
    ? resized.jpeg({ quality: OPTIMIZED_QUALITY }).toBuffer()
    : resized.webp({ quality: OPTIMIZED_QUALITY }).toBuffer();
}
