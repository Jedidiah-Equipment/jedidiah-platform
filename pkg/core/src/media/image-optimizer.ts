import sharp from 'sharp';

import { IMAGE_TRANSFORMS, type ImageTransformName, imageFormatForTransform } from './image-transform.js';

// Resize-down to the requested transform's size and quality. `rotate()` bakes in EXIF orientation before
// the strip; `withoutEnlargement` leaves a narrower source untouched while still re-encoding it. Throws
// on non-raster or corrupt input so the cache pipeline can serve the original bytes instead.
export async function optimizeImage(bytes: Uint8Array, transformName: ImageTransformName): Promise<Buffer> {
  const { maxWidth, quality } = IMAGE_TRANSFORMS[transformName];
  const resized = sharp(bytes).rotate().resize({ width: maxWidth, withoutEnlargement: true });

  // JPEG cannot preserve alpha; flatten transparent uploads onto white for usable social preview cards.
  return imageFormatForTransform(transformName) === 'jpeg'
    ? resized.flatten({ background: '#ffffff' }).jpeg({ quality }).toBuffer()
    : resized.webp({ quality }).toBuffer();
}
