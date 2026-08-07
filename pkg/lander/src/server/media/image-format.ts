import {
  CATALOG_IMAGE_WIDTHS,
  type CatalogImageWidth,
  DEFAULT_CATALOG_IMAGE_WIDTH,
  type ImageTransformName,
  webpTransformForWidth,
} from '@pkg/core';

// The Lander's route-facing format choices. The shared transform table lives in @pkg/core;
// which transform a public URL resolves to is a Lander concern.

// The `?format=` value a URL carries. WebP for browsers; JPEG for the social scrapers that still refuse it.
export type PublicImageFormat = 'webp' | 'jpeg';
export const DEFAULT_IMAGE_FORMAT: PublicImageFormat = 'webp';
// The format for URL-valued head tags (og:image, twitter:image).
export const OG_IMAGE_FORMAT: PublicImageFormat = 'jpeg';

// Forgiving parse for the public route's `?format=` param: anything unrecognized falls back to the
// default, mirroring how an invalid `?slot=` falls back to `primary` for public crawlers.
export function parseImageFormat(value: string | null | undefined): PublicImageFormat {
  return value === 'jpeg' ? 'jpeg' : DEFAULT_IMAGE_FORMAT;
}

// Equally forgiving parse for `?w=`. Only the published candidate widths are honoured — an arbitrary width
// would let any caller mint unbounded cache entries and sharp work.
export function parseImageWidth(value: string | null | undefined): CatalogImageWidth {
  const parsed = Number(value);

  return CATALOG_IMAGE_WIDTHS.find((width) => width === parsed) ?? DEFAULT_CATALOG_IMAGE_WIDTH;
}

// Resolves a public URL's `?format=`/`?w=` pair to the transform that serves it. JPEG is only ever produced
// for social cards, at the one size they need, so it ignores the width.
export function resolveImageTransform(
  format: string | null | undefined,
  width: string | null | undefined,
): ImageTransformName {
  return parseImageFormat(format) === 'jpeg' ? 'jpeg' : webpTransformForWidth(parseImageWidth(width));
}
