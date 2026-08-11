import {
  PART_STOCK_TRACKING_MODE_LABELS,
  PART_UNIT_OF_MEASURE_LABELS,
  type Part,
  PartCategory,
  PartCode,
  PartCreateInput,
  PartDescription,
  PartDrawingCode,
  PartFinish,
  PartMinimumStock,
  PartName,
  PartStandardPurchaseLengthMm,
  PartStockTrackingMode,
  PartStorageLocation,
  PartSupplierCode,
  PartUnitOfMeasure,
  refinePartBuiltIsNotLinear,
  refinePartStandardPurchaseLength,
  refinePartSupplier,
  type UUID,
  UUID as UUIDSchema,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr } from '@/components/form/utils/form-schema.js';

const PartFormFields = z.object({
  category: PartCategory,
  code: PartCode,
  description: PartDescription,
  drawingCode: emptyStringOr(PartDrawingCode),
  finish: PartFinish,
  isInternallyFabricated: z.boolean(),
  minimumStock: z.union([PartMinimumStock, z.nan()]),
  name: PartName,
  standardPurchaseLengthMm: z.union([PartStandardPurchaseLengthMm, z.nan()]),
  stockTrackingMode: PartStockTrackingMode,
  storageLocation: emptyStringOr(PartStorageLocation),
  supplierCode: PartSupplierCode,
  supplierId: emptyStringOr(UUIDSchema),
  unitOfMeasure: PartUnitOfMeasure,
});

export type PartFormValues = z.infer<typeof PartFormValues>;
export const PartFormValues = PartFormFields.superRefine((values, context) => {
  refinePartBuiltIsNotLinear(values, context);
  refinePartStandardPurchaseLength(
    {
      standardPurchaseLengthMm: Number.isNaN(values.standardPurchaseLengthMm) ? null : values.standardPurchaseLengthMm,
      unitOfMeasure: values.unitOfMeasure,
    },
    context,
  );
  refinePartSupplier(
    { isInternallyFabricated: values.isInternallyFabricated, supplierId: partSupplierIdOf(values) },
    context,
  );
});

/**
 * Supplier XOR BOM. Ticking "internally fabricated" hides the Supplier select, so whatever it last
 * held is dropped here rather than left to fail validation against a field nobody can see.
 */
function partSupplierIdOf(values: Pick<PartFormValues, 'isInternallyFabricated' | 'supplierId'>): string | null {
  return values.isInternallyFabricated ? null : values.supplierId || null;
}

export const partStockTrackingModeOptions = PartStockTrackingMode.options.map((value) => ({
  label: PART_STOCK_TRACKING_MODE_LABELS[value],
  value,
}));

export const partUnitOfMeasureOptions = PartUnitOfMeasure.options.map((value) => ({
  label: PART_UNIT_OF_MEASURE_LABELS[value],
  value,
}));

export function toPartFormValues({
  fixedSupplierId,
  initialPart,
}: {
  fixedSupplierId?: UUID | null | undefined;
  initialPart?: Part | undefined;
}): PartFormValues {
  return {
    category: initialPart?.category ?? '',
    code: initialPart?.code ?? '',
    description: initialPart?.description ?? '',
    drawingCode: initialPart?.drawingCode ?? '',
    finish: initialPart?.finish ?? '',
    isInternallyFabricated: initialPart?.isInternallyFabricated ?? false,
    minimumStock: initialPart?.minimumStock ?? NaN,
    name: initialPart?.name ?? '',
    standardPurchaseLengthMm: initialPart?.standardPurchaseLengthMm ?? NaN,
    stockTrackingMode: initialPart?.stockTrackingMode ?? 'perpetual',
    storageLocation: initialPart?.storageLocation ?? '',
    supplierCode: initialPart?.supplierCode ?? '',
    supplierId: fixedSupplierId ?? initialPart?.supplierId ?? '',
    unitOfMeasure: initialPart?.unitOfMeasure ?? 'piece',
  };
}

export function toPartInput(values: PartFormValues): PartCreateInput {
  return PartCreateInput.parse({
    ...values,
    drawingCode: values.drawingCode || null,
    minimumStock: Number.isNaN(values.minimumStock) ? null : values.minimumStock,
    standardPurchaseLengthMm: Number.isNaN(values.standardPurchaseLengthMm) ? null : values.standardPurchaseLengthMm,
    storageLocation: values.storageLocation || null,
    supplierId: partSupplierIdOf(values),
  });
}
