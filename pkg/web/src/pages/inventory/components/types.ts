import {
  PostAdjustmentInput,
  PostJobMovementInput,
  PostRevaluationInput,
  StockAdjustmentReason,
  type StockOnHandRow,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { requiredSelection } from '@/components/form/utils/form-schema.js';

export type StockPartOption = Pick<
  StockOnHandRow,
  'isInternallyFabricated' | 'partCode' | 'partId' | 'partName' | 'standardPurchaseLengthMm' | 'unitOfMeasure'
>;

/**
 * A movement's length bucket is only meaningful on a linear Part. The form always holds the field so
 * the control stays uncontrolled-free; these schemas reject it on the Parts that must not carry one.
 */
const StockMovementLengthValue = z.union([z.nan(), z.int().positive('Enter the piece length in millimetres')]);

function refineLengthForPart(
  values: { lengthMm: number; partId: string },
  parts: readonly StockPartOption[],
  context: z.RefinementCtx,
): void {
  const isLinear = parts.find((part) => part.partId === values.partId)?.unitOfMeasure === 'mm';

  if (isLinear && Number.isNaN(values.lengthMm)) {
    context.addIssue({ code: 'custom', message: 'Linear stock needs a piece length', path: ['lengthMm'] });
  }
}

export type StockAdjustmentFormValues = z.infer<typeof StockAdjustmentFormValues>;
export const StockAdjustmentFormValues = z.object({
  delta: z.number().finite('Enter a signed quantity'),
  lengthMm: StockMovementLengthValue,
  note: z.string(),
  partId: requiredSelection(UUID, 'Select a Part'),
  reason: StockAdjustmentReason,
  unitCost: z.union([z.nan(), z.number().min(0, 'Must be zero or greater')]),
});

export type StockRevaluationFormValues = z.infer<typeof StockRevaluationFormValues>;
export const StockRevaluationFormValues = z.object({
  note: z.string(),
  partId: requiredSelection(UUID, 'Select a Part'),
  unitCost: z.number().min(0, 'Must be zero or greater'),
});

export type StockJobMovementFormValues = z.infer<typeof StockJobMovementFormValues>;
export const StockJobMovementFormValues = z.object({
  jobId: requiredSelection(UUID, 'Select a Job'),
  lengthMm: StockMovementLengthValue,
  partId: requiredSelection(UUID, 'Select a Part'),
  quantity: z.number().positive('Enter a quantity greater than zero'),
});

/** Adds the per-Part rules a flat form schema cannot express on its own. */
export function stockAdjustmentValidator(parts: readonly StockPartOption[]) {
  return StockAdjustmentFormValues.superRefine((values, context) => {
    refineLengthForPart(values, parts, context);

    // Mirrors PostAdjustmentInput so the rule reads as a field error rather than a failed request.
    if (values.reason !== 'opening-balance' && values.note.trim() === '') {
      context.addIssue({ code: 'custom', message: 'A note is required for this adjustment reason', path: ['note'] });
    }
  });
}

export function stockJobMovementValidator(parts: readonly StockPartOption[]) {
  return StockJobMovementFormValues.superRefine((values, context) => refineLengthForPart(values, parts, context));
}

export function toAdjustmentInput(values: StockAdjustmentFormValues, canReadCost: boolean, part: StockPartOption) {
  return PostAdjustmentInput.parse({
    delta: values.delta,
    lengthMm: part.unitOfMeasure === 'mm' ? values.lengthMm : null,
    note: values.note,
    partId: values.partId,
    reason: values.reason,
    unitCost:
      canReadCost &&
      !part.isInternallyFabricated &&
      values.reason === 'opening-balance' &&
      !Number.isNaN(values.unitCost)
        ? values.unitCost
        : null,
  });
}

export function toRevaluationInput(values: StockRevaluationFormValues) {
  return PostRevaluationInput.parse(values);
}

export function toJobMovementInput(values: StockJobMovementFormValues, part: StockPartOption) {
  return PostJobMovementInput.parse({
    jobId: values.jobId,
    lengthMm: part.unitOfMeasure === 'mm' ? values.lengthMm : null,
    partId: values.partId,
    quantity: values.quantity,
  });
}

export function toStockPartOption(item: StockOnHandRow): StockPartOption {
  return {
    isInternallyFabricated: item.isInternallyFabricated,
    partCode: item.partCode,
    partId: item.partId,
    partName: item.partName,
    standardPurchaseLengthMm: item.standardPurchaseLengthMm,
    unitOfMeasure: item.unitOfMeasure,
  };
}

export function perpetualPartOptions(items: readonly StockOnHandRow[]): StockPartOption[] {
  return items.filter((item) => item.stockTrackingMode === 'perpetual').map(toStockPartOption);
}

export function revaluablePartOptions(parts: readonly StockPartOption[]): StockPartOption[] {
  return parts.filter((part) => !part.isInternallyFabricated);
}

export function partSelectOptions(parts: readonly StockPartOption[]) {
  return parts.map((part) => ({ label: `${part.partCode} · ${part.partName}`, value: part.partId }));
}
