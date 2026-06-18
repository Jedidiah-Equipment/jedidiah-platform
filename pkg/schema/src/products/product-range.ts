import { z } from 'zod';

import { DateIso } from '../common/date.js';
import { EntityImage } from '../common/image.js';
import { requiredTrimmedText } from '../common/text.js';
import { UUID } from '../common/uuid.js';

// Cap for an uploaded Product Range image. The bytes live in private object storage (not inline in the
// row), so this matches the brochure image ceiling rather than the small inline-data-URL limits.
export const RANGE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export type ProductRangeName = z.infer<typeof ProductRangeName>;
export const ProductRangeName = requiredTrimmedText('Range name is required');

export type ProductRange = z.infer<typeof ProductRange>;
export const ProductRange = z.object({
  id: UUID,
  name: ProductRangeName,
  // The Range's single presentation image, exposed as a client-safe reference (no storage key). Replaced
  // in place through the dedicated image route, never carried on the create/update payload.
  image: EntityImage.nullable(),
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
  })
  .strict();

export type ProductRangeUpdateInput = z.infer<typeof ProductRangeUpdateInput>;
export const ProductRangeUpdateInput = z
  .object({
    id: UUID,
    name: ProductRangeName,
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

// Route params for the Range image upload/download endpoints, parsed by the entity-image route config.
export type ProductRangeImageParams = z.infer<typeof ProductRangeImageParams>;
export const ProductRangeImageParams = z.object({
  rangeId: UUID,
});
