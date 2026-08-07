import sharp from 'sharp';

import { IMAGE_TRANSFORMS, type ImageTransformName, imageFormatForTransform } from './image-transform.js';

// Resize to the requested transform's size and quality. `rotate()` bakes in EXIF orientation before the
// strip. Throws on non-raster or corrupt input so the cache pipeline can serve the original bytes instead.
//
// A plain width transform only ever shrinks: `withoutEnlargement` leaves a narrower source at its own size
// while still re-encoding it. A transform with an `exactHeight` must instead fill its box exactly — `cover`
// trims whichever axis overflows, and enlargement stays on so a small source still lands on the dimensions
// the caller has already promised elsewhere.
export async function optimizeImage(bytes: Uint8Array, transformName: ImageTransformName): Promise<Buffer> {
  const { exactHeight, maxWidth, quality } = IMAGE_TRANSFORMS[transformName];
  const resized = sharp(bytes)
    .rotate()
    .resize(
      exactHeight === undefined
        ? { width: maxWidth, withoutEnlargement: true }
        : { width: maxWidth, height: exactHeight, fit: 'cover' },
    );

  // JPEG cannot preserve alpha; flatten transparent uploads onto white for usable social preview cards.
  return imageFormatForTransform(transformName) === 'jpeg'
    ? resized.flatten({ background: '#ffffff' }).jpeg({ quality }).toBuffer()
    : resized.webp({ quality }).toBuffer();
}
