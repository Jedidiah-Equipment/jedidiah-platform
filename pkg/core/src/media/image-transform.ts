// The named image transforms shared by the public Lander and authenticated API. The transform name is
// part of the caller-facing contract, while the encoded format remains part of the cache signature so
// changing a transform invalidates only the bytes produced by that transform.

// The widths a catalog image is served at. A layout picks the candidates it needs and hands the browser a
// `srcset`; without this a Range card painted 272px wide still downloaded the full 1280px encode.
//
// 1280 is the widest anything paints — the Product detail hero — and stays the default for a URL that names
// no width, which keeps every link minted before this existed pointing at the same bytes.
export const CATALOG_IMAGE_WIDTHS = [320, 640, 960, 1280] as const;
export type CatalogImageWidth = (typeof CATALOG_IMAGE_WIDTHS)[number];
export const DEFAULT_CATALOG_IMAGE_WIDTH: CatalogImageWidth = 1280;

export type ImageTransformName = `webp${CatalogImageWidth}` | 'jpeg';

export const IMAGE_TRANSFORMS: Record<ImageTransformName, { maxWidth: number; quality: number; contentType: string }> =
  {
    webp320: { maxWidth: 320, quality: 80, contentType: 'image/webp' },
    webp640: { maxWidth: 640, quality: 80, contentType: 'image/webp' },
    webp960: { maxWidth: 960, quality: 80, contentType: 'image/webp' },
    webp1280: { maxWidth: 1280, quality: 80, contentType: 'image/webp' },
    jpeg: { maxWidth: 1024, quality: 75, contentType: 'image/jpeg' },
  };

export function webpTransformForWidth(width: CatalogImageWidth): ImageTransformName {
  return `webp${width}`;
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
