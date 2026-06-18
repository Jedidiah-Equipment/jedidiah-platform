import {
  type ProductRange,
  type ProductRangeCreateInput,
  ProductRangeCreateInput as ProductRangeCreateInputSchema,
  ProductRangeName,
  type ProductRangeUpdateInput,
  ProductRangeUpdateInput as ProductRangeUpdateInputSchema,
  type UUID,
} from '@pkg/schema';
import { z } from 'zod';

// Browser form shape for a Range. Per-field rules defer to the `@pkg/schema` scalars; the server
// re-validates the same constraints on create/update. The image is never part of this payload — it is
// replaced in place through the dedicated upload route.
export type ProductRangeFormValues = z.infer<typeof ProductRangeFormValues>;
export const ProductRangeFormValues = z.object({
  name: ProductRangeName,
});

export function toProductRangeFormValues(range?: ProductRange): ProductRangeFormValues {
  return { name: range?.name ?? '' };
}

export function toProductRangeCreateInput(value: ProductRangeFormValues): ProductRangeCreateInput {
  return ProductRangeCreateInputSchema.parse({ name: value.name.trim() });
}

export function toProductRangeUpdateInput(id: UUID, value: ProductRangeFormValues): ProductRangeUpdateInput {
  return ProductRangeUpdateInputSchema.parse({ id, name: value.name.trim() });
}
