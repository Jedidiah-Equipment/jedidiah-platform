import { z } from 'zod';

import { DateIso } from '../common/date.js';
import { EntityImage } from '../common/image.js';
import { nullableTrimmedText, nullableTrimmedTextInput, requiredTrimmedText } from '../common/text.js';
import { UUID } from '../common/uuid.js';

// Cap for an uploaded Product Range image. The bytes live in private object storage (not inline in the
// row), so this matches the brochure image ceiling rather than the small inline-data-URL limits.
export const RANGE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

// Cap for an uploaded Product Range brochure logo. Stored in object storage like the presentation image,
// so it shares the same ceiling.
export const RANGE_LOGO_MAX_BYTES = 10 * 1024 * 1024;

export type ProductRangeName = z.infer<typeof ProductRangeName>;
export const ProductRangeName = requiredTrimmedText('Range name is required');

export type ProductRangeDescription = z.infer<typeof ProductRangeDescription>;
export const ProductRangeDescription = nullableTrimmedText();

export type ProductRangeDescriptionInput = z.infer<typeof ProductRangeDescriptionInput>;
export const ProductRangeDescriptionInput = nullableTrimmedTextInput();

export type ProductRange = z.infer<typeof ProductRange>;
export const ProductRange = z.object({
  id: UUID,
  name: ProductRangeName,
  description: ProductRangeDescription,
  // The Range's single presentation image, exposed as a client-safe reference (no storage key). Replaced
  // in place through the dedicated image route, never carried on the create/update payload.
  image: EntityImage.nullable(),
  // The Range's brochure logo (top-right of the product brochure), same client-safe reference shape as
  // `image`. Replaced in place through the dedicated logo route, never on the create/update payload.
  logo: EntityImage.nullable(),
  // Admin-controlled position in the Range list. Auto-assigned on create, rewritten via the reorder
  // mutation; never carried on the create/update payload.
  displayOrder: z.number().int(),
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
    description: ProductRangeDescriptionInput,
  })
  .strict();

export type ProductRangeUpdateInput = z.infer<typeof ProductRangeUpdateInput>;
export const ProductRangeUpdateInput = z
  .object({
    id: UUID,
    name: ProductRangeName,
    description: ProductRangeDescriptionInput,
  })
  .strict();

// Reorder payload: the full set of Range ids in their new display order. The service rewrites each
// Range's displayOrder to its index in this array.
export type ProductRangeReorderInput = z.infer<typeof ProductRangeReorderInput>;
export const ProductRangeReorderInput = z
  .object({
    orderedIds: z.array(UUID).min(1),
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

// Route params for the Range logo upload/download endpoints, parsed by the entity-image route config.
export type ProductRangeLogoParams = z.infer<typeof ProductRangeLogoParams>;
export const ProductRangeLogoParams = z.object({
  rangeId: UUID,
});
