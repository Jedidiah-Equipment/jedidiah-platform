import type { UUID } from '@pkg/schema';
import { type ProductUnitDetail, ProductUnitUpdateInput, ProductUnitVinNumber } from '@pkg/schema/equipment';
import { z } from 'zod';

import { emptyStringOr } from '@/components/form/utils/form-schema.js';

export type UnitEditFormValues = z.infer<typeof UnitEditFormValues>;
export const UnitEditFormValues = z.object({
  vinNumber: emptyStringOr(ProductUnitVinNumber),
});

/** Schema → form. A machine with no VIN captured yet shows a blank field, not the word "null". */
export function toUnitEditFormValues(unit: Pick<ProductUnitDetail, 'vinNumber'>): UnitEditFormValues {
  return {
    vinNumber: unit.vinNumber ?? '',
  };
}

/** Form → schema. Parsing through `ProductUnitUpdateInput` applies the shared `''` → null transform. */
export function toProductUnitUpdateInput(id: UUID, values: UnitEditFormValues): ProductUnitUpdateInput {
  return ProductUnitUpdateInput.parse({
    id,
    vinNumber: values.vinNumber,
  });
}
