import { z } from 'zod';

import { buildImageDataUrlPattern, hasAlignedBase64Payload } from './image-data-url.js';

export const THUMBNAIL_DATA_URL_MAX_BYTES = 64 * 1024;

const THUMBNAIL_DATA_URL_PATTERN = buildImageDataUrlPattern(['jpeg', 'webp']);

export type ThumbnailDataUrl = z.infer<typeof ThumbnailDataUrl>;
export const ThumbnailDataUrl = z
  .string()
  .max(THUMBNAIL_DATA_URL_MAX_BYTES, 'Thumbnail must be 64 KB or smaller')
  .refine((value) => THUMBNAIL_DATA_URL_PATTERN.test(value), 'Thumbnail must be a JPEG or WebP data URL')
  .refine(hasAlignedBase64Payload, 'Thumbnail data URL is malformed');

export type NullableThumbnailDataUrl = z.infer<typeof NullableThumbnailDataUrl>;
export const NullableThumbnailDataUrl = ThumbnailDataUrl.nullable();
