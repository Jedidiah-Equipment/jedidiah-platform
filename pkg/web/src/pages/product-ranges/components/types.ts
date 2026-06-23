import {
  type ProductRange,
  type ProductRangeCreateInput,
  ProductRangeCreateInput as ProductRangeCreateInputSchema,
  ProductRangeDescription,
  ProductRangeName,
  type ProductRangeUpdateInput,
  ProductRangeUpdateInput as ProductRangeUpdateInputSchema,
  type UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr } from '@/components/form/utils/form-schema.js';

// Browser form shape for a Range. Per-field rules defer to the `@pkg/schema` scalars; the server
// re-validates the same constraints on create/update. The image is never part of this payload — it is
// replaced in place through the dedicated upload route. The description is an empty-string-or-text field
// in the browser; the input schemas map a blank back to null.
export type ProductRangeFormValues = z.infer<typeof ProductRangeFormValues>;
export const ProductRangeFormValues = z.object({
  name: ProductRangeName,
  description: emptyStringOr(ProductRangeDescription),
});

export function toProductRangeFormValues(range?: ProductRange): ProductRangeFormValues {
  return { name: range?.name ?? '', description: range?.description ?? '' };
}

export function toProductRangeCreateInput(value: ProductRangeFormValues): ProductRangeCreateInput {
  return ProductRangeCreateInputSchema.parse({ name: value.name.trim(), description: value.description });
}

export function toProductRangeUpdateInput(id: UUID, value: ProductRangeFormValues): ProductRangeUpdateInput {
  return ProductRangeUpdateInputSchema.parse({ id, name: value.name.trim(), description: value.description });
}
