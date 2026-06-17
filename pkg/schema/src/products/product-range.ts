import { z } from 'zod';

import { DateIso } from '../common/date.js';
import {
  buildImageDataUrlPattern,
  decodedBase64ByteLength,
  hasAlignedBase64Payload,
} from '../common/image-data-url.js';
import { requiredTrimmedText } from '../common/text.js';
import { UUID } from '../common/uuid.js';

export const RANGE_IMAGE_DATA_URL_MAX_BYTES = 512 * 1024;

const RANGE_IMAGE_DATA_URL_PATTERN = buildImageDataUrlPattern(['jpeg', 'png']);

export type ProductRangeName = z.infer<typeof ProductRangeName>;
export const ProductRangeName = requiredTrimmedText('Range name is required');

export type RangeImageDataUrl = z.infer<typeof RangeImageDataUrl>;
export const RangeImageDataUrl = z
  .string()
  .refine((value) => RANGE_IMAGE_DATA_URL_PATTERN.test(value), 'Range image must be a JPEG or PNG data URL')
  .refine(hasAlignedBase64Payload, 'Range image data URL is malformed')
  .refine((value) => decodedBase64ByteLength(value) <= RANGE_IMAGE_DATA_URL_MAX_BYTES, {
    message: 'Range image must be 512 KB or smaller',
  });

export type NullableRangeImageDataUrl = z.infer<typeof NullableRangeImageDataUrl>;
export const NullableRangeImageDataUrl = RangeImageDataUrl.nullable();

export type ProductRange = z.infer<typeof ProductRange>;
export const ProductRange = z.object({
  id: UUID,
  name: ProductRangeName,
  imageDataUrl: NullableRangeImageDataUrl,
  createdAt: DateIso,
  updatedAt: DateIso,
});

export type ProductRangeOption = z.infer<typeof ProductRangeOption>;
export const ProductRangeOption = ProductRange.pick({
  id: true,
  name: true,
});

export type ProductRangeCreateInput = z.infer<typeof ProductRangeCreateInput>;
export const ProductRangeCreateInput = z
  .object({
    name: ProductRangeName,
    imageDataUrl: NullableRangeImageDataUrl.default(null),
  })
  .strict();

export type ProductRangeUpdateInput = z.infer<typeof ProductRangeUpdateInput>;
export const ProductRangeUpdateInput = z
  .object({
    id: UUID,
    name: ProductRangeName,
    imageDataUrl: NullableRangeImageDataUrl,
  })
  .strict();

export type ProductRangeListResult = z.infer<typeof ProductRangeListResult>;
export const ProductRangeListResult = z.object({
  ranges: z.array(ProductRange),
});

export type ProductRangeOptionsResult = z.infer<typeof ProductRangeOptionsResult>;
export const ProductRangeOptionsResult = z.object({
  ranges: z.array(ProductRangeOption),
});
