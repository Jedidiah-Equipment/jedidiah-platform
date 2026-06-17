import { z } from 'zod';

import { DateIso } from '../common/date.js';
import { requiredTrimmedText } from '../common/text.js';
import { UUID } from '../common/uuid.js';

export const RANGE_IMAGE_DATA_URL_MAX_BYTES = 512 * 1024;
export const CROSSHAUL_PRODUCT_RANGE_ID = '00000000-0000-4000-8000-000000000488';
export const CROSSHAUL_PRODUCT_RANGE_NAME = 'Crosshaul';

const RANGE_IMAGE_DATA_URL_PATTERN = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;

export type ProductRangeName = z.infer<typeof ProductRangeName>;
export const ProductRangeName = requiredTrimmedText('Range name is required');

export type RangeImageDataUrl = z.infer<typeof RangeImageDataUrl>;
export const RangeImageDataUrl = z
  .string()
  .refine((value) => RANGE_IMAGE_DATA_URL_PATTERN.test(value), 'Range image must be a JPEG or PNG data URL')
  .refine(hasAlignedBase64Payload, 'Range image data URL is malformed')
  .refine((value) => getDecodedBase64ByteLength(value) <= RANGE_IMAGE_DATA_URL_MAX_BYTES, {
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

function getBase64Payload(value: string): string | null {
  return value.split(',', 2)[1] ?? null;
}

function hasAlignedBase64Payload(value: string): boolean {
  const payload = getBase64Payload(value);

  return payload !== null && payload.length % 4 === 0;
}

function getDecodedBase64ByteLength(value: string): number {
  const payload = getBase64Payload(value);

  if (!payload || payload.length % 4 !== 0) {
    return Number.POSITIVE_INFINITY;
  }

  const paddingBytes = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;

  return (payload.length / 4) * 3 - paddingBytes;
}
