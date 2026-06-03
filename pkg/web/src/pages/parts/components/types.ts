import {
  PART_UNIT_OF_MEASURE_LABELS,
  type Part,
  PartCategory,
  PartCode,
  PartDescription,
  PartDrawingCode,
  PartFinish,
  PartName,
  PartSupplierCode,
  PartUnitOfMeasure,
  type UUID,
  UUID as UUIDSchema,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr, requiredSelection } from '@/components/form/utils/form-schema.js';

export type PartFormValues = z.infer<typeof PartFormValues>;
export const PartFormValues = z.object({
  category: PartCategory,
  code: PartCode,
  description: PartDescription,
  drawingCode: emptyStringOr(PartDrawingCode),
  finish: PartFinish,
  isInternallyFabricated: z.boolean(),
  name: PartName,
  supplierCode: PartSupplierCode,
  supplierId: requiredSelection(UUIDSchema, 'Select a supplier'),
  unitOfMeasure: PartUnitOfMeasure,
});

export const partUnitOfMeasureOptions = PartUnitOfMeasure.options.map((value) => ({
  label: PART_UNIT_OF_MEASURE_LABELS[value],
  value,
}));

export function toPartFormValues({
  fixedSupplierId,
  initialPart,
}: {
  fixedSupplierId?: UUID | undefined;
  initialPart?: Part | undefined;
}): PartFormValues {
  return {
    category: initialPart?.category ?? '',
    code: initialPart?.code ?? '',
    description: initialPart?.description ?? '',
    drawingCode: initialPart?.drawingCode ?? '',
    finish: initialPart?.finish ?? '',
    isInternallyFabricated: initialPart?.isInternallyFabricated ?? false,
    name: initialPart?.name ?? '',
    supplierCode: initialPart?.supplierCode ?? '',
    supplierId: fixedSupplierId ?? initialPart?.supplierId ?? '',
    unitOfMeasure: initialPart?.unitOfMeasure ?? 'quantity',
  };
}
