import {
  type PartCategory,
  PartCategoryMarkupPercent,
  PartCategoryName,
  type PartCategoryUpdateInput,
} from '@pkg/schema/equipment';
import { z } from 'zod';
import { nanToNull, optionalNumber } from '@/components/form/utils/form-schema.js';

export type PartCategoryFormValues = z.infer<typeof PartCategoryFormValues>;
export const PartCategoryFormValues = z.object({
  markupPercent: optionalNumber(PartCategoryMarkupPercent),
  name: PartCategoryName,
});

/** The form's blank markup is NaN where the category's is null. */
export function partCategoryFormValues(category: PartCategory): PartCategoryFormValues {
  return { markupPercent: category.markupPercent ?? NaN, name: category.name };
}

export function partCategoryFormToInput(id: string, values: PartCategoryFormValues): PartCategoryUpdateInput {
  return { id, markupPercent: nanToNull(values.markupPercent), name: values.name };
}
