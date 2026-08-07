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

// Open Graph's documented card size. Every platform crops an off-ratio card to something like this shape on
// its own, unpredictably, so the card transform below crops to it deliberately instead. Fixing the box is
// also what lets a page state `og:image:width`/`og:image:height`: dimensions that disagree with the bytes are
// worse than none at all.
export const SOCIAL_CARD_SIZE = { width: 1200, height: 630 } as const;

export type ImageTransformName = `webp${CatalogImageWidth}` | 'jpeg';

type ImageTransform = {
  contentType: string;
  maxWidth: number;
  quality: number;
  /**
   * Crops to exactly `maxWidth` x `exactHeight`, enlarging a source narrower than the box rather than
   * under-filling it. Only the social card sets this; a catalog image keeps the photograph's own shape.
   */
  exactHeight?: number;
};

export const IMAGE_TRANSFORMS: Record<ImageTransformName, ImageTransform> = {
  webp320: { maxWidth: 320, quality: 80, contentType: 'image/webp' },
  webp640: { maxWidth: 640, quality: 80, contentType: 'image/webp' },
  webp960: { maxWidth: 960, quality: 80, contentType: 'image/webp' },
  webp1280: { maxWidth: 1280, quality: 80, contentType: 'image/webp' },
  jpeg: {
    maxWidth: SOCIAL_CARD_SIZE.width,
    exactHeight: SOCIAL_CARD_SIZE.height,
    quality: 75,
    contentType: 'image/jpeg',
  },
};

export function webpTransformForWidth(width: CatalogImageWidth): ImageTransformName {
  return `webp${width}`;
}

export function imageFormatForTransform(transformName: ImageTransformName): 'jpeg' | 'webp' {
  return IMAGE_TRANSFORMS[transformName].contentType === 'image/jpeg' ? 'jpeg' : 'webp';
}

// Identifies the exact transform that produced a set of bytes. A signature must change whenever the output
// does, and must not change otherwise: the WebP signatures are already embedded in browser and CDN cache
// keys, so a cropped transform names both of its axes rather than redefining the single-width form.
export function transformSignature(transformName: ImageTransformName): string {
  const transform = IMAGE_TRANSFORMS[transformName];
  const box =
    transform.exactHeight === undefined ? `w${transform.maxWidth}` : `w${transform.maxWidth}x${transform.exactHeight}`;

  return `${box}-${imageFormatForTransform(transformName)}-q${transform.quality}`;
}
