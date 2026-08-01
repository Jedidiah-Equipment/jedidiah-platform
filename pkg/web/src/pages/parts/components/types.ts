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
  type UUID,
  UUID as UUIDSchema,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr, requiredSelection } from '@/components/form/utils/form-schema.js';

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
  supplierId: requiredSelection(UUIDSchema, 'Select a supplier'),
  unitOfMeasure: PartUnitOfMeasure,
});

export type PartFormValues = z.infer<typeof PartFormValues>;
export const PartFormValues = PartFormFields.superRefine((values, context) => {
  const hasPurchaseLength = !Number.isNaN(values.standardPurchaseLengthMm);

  if (values.unitOfMeasure === 'mm' && !hasPurchaseLength) {
    context.addIssue({
      code: 'custom',
      message: 'Standard purchase length is required for millimetre parts',
      path: ['standardPurchaseLengthMm'],
    });
  }

  if (values.unitOfMeasure !== 'mm' && hasPurchaseLength) {
    context.addIssue({
      code: 'custom',
      message: 'Standard purchase length is only valid for millimetre parts',
      path: ['standardPurchaseLengthMm'],
    });
  }
});

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
  });
}
