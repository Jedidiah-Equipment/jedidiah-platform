// The named image transforms shared by the public Lander and authenticated API. The transform name is
// part of the caller-facing contract, while the encoded format remains part of the cache signature so
// changing a transform invalidates only the bytes produced by that transform.
export type ImageTransformName = 'webp' | 'jpeg' | 'mobileWebp';

export const IMAGE_TRANSFORMS: Record<ImageTransformName, { maxWidth: number; quality: number; contentType: string }> =
  {
    webp: { maxWidth: 1280, quality: 80, contentType: 'image/webp' },
    jpeg: { maxWidth: 1024, quality: 75, contentType: 'image/jpeg' },
    mobileWebp: { maxWidth: 640, quality: 80, contentType: 'image/webp' },
  };

export const DEFAULT_IMAGE_FORMAT: ImageTransformName = 'webp';
// The format for URL-valued head tags (og:image, twitter:image).
export const OG_IMAGE_FORMAT: ImageTransformName = 'jpeg';

// Forgiving parse for the public route's `?format=` param: anything unrecognized falls back to the
// default, mirroring how an invalid `?slot=` falls back to `primary` for public crawlers.
export function parseImageFormat(value: string | null | undefined): ImageTransformName {
  return value === 'jpeg' ? 'jpeg' : DEFAULT_IMAGE_FORMAT;
}

export function imageFormatForTransform(transformName: ImageTransformName): 'jpeg' | 'webp' {
  return IMAGE_TRANSFORMS[transformName].contentType === 'image/jpeg' ? 'jpeg' : 'webp';
}

// Identifies the exact transform that produced a set of bytes. Existing Lander signatures must remain
// stable because they are already embedded in browser/CDN cache keys.
export function transformSignature(transformName: ImageTransformName): string {
  const transform = IMAGE_TRANSFORMS[transformName];

  return `w${transform.maxWidth}-${imageFormatForTransform(transformName)}-q${transform.quality}`;
}
