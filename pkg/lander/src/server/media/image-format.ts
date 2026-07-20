import type { ImageTransformName } from '@pkg/core';

// The Lander's route-facing format choices. The shared transform table lives in @pkg/core;
// which transform a public URL resolves to is a Lander concern.
export const DEFAULT_IMAGE_FORMAT: ImageTransformName = 'webp';
// The format for URL-valued head tags (og:image, twitter:image).
export const OG_IMAGE_FORMAT: ImageTransformName = 'jpeg';

// Forgiving parse for the public route's `?format=` param: anything unrecognized falls back to the
// default, mirroring how an invalid `?slot=` falls back to `primary` for public crawlers.
export function parseImageFormat(value: string | null | undefined): ImageTransformName {
  return value === 'jpeg' ? 'jpeg' : DEFAULT_IMAGE_FORMAT;
}
