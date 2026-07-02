import sharp from 'sharp';

import { IMAGE_TRANSFORMS, type OptimizedImageFormat } from './image-transform.js';

// Resize-down to the requested format's size and quality. `rotate()` bakes in EXIF orientation before the
// strip; `withoutEnlargement` leaves a source already narrower than the target untouched (still re-encoded,
// never upscaled). Throws on non-raster or corrupt input — the caller treats that as "serve the original
// bytes" rather than a failure. WebP keeps a transparent source's alpha (the site renders it over its own
// background); JPEG cannot, and sharp would otherwise flatten to black, so transparent uploads are
// flattened onto white for a usable social preview card.
export async function optimizeImage(bytes: Uint8Array, format: OptimizedImageFormat): Promise<Buffer> {
  const { maxWidth, quality } = IMAGE_TRANSFORMS[format];
  const resized = sharp(bytes).rotate().resize({ width: maxWidth, withoutEnlargement: true });

  return format === 'jpeg'
    ? resized.flatten({ background: '#ffffff' }).jpeg({ quality }).toBuffer()
    : resized.webp({ quality }).toBuffer();
}
