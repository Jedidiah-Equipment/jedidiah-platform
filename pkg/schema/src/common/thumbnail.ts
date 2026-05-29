import { z } from 'zod';

export const THUMBNAIL_DATA_URL_MAX_BYTES = 64 * 1024;

const THUMBNAIL_DATA_URL_PATTERN = /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export type ThumbnailDataUrl = z.infer<typeof ThumbnailDataUrl>;
export const ThumbnailDataUrl = z
  .string()
  .max(THUMBNAIL_DATA_URL_MAX_BYTES, 'Thumbnail must be 64 KB or smaller')
  .refine((value) => THUMBNAIL_DATA_URL_PATTERN.test(value), 'Thumbnail must be a JPEG or WebP data URL')
  .refine((value) => {
    const payload = value.split(',', 2)[1];
    return payload !== undefined && payload.length > 0 && payload.length % 4 === 0;
  }, 'Thumbnail data URL is malformed');

export type NullableThumbnailDataUrl = z.infer<typeof NullableThumbnailDataUrl>;
export const NullableThumbnailDataUrl = ThumbnailDataUrl.nullable();
