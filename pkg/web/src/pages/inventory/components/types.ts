import {
  CloseOutJobInput,
  InventoryUnitCost,
  PostAdjustmentInput,
  PostJobMovementInput,
  PostRevaluationInput,
  Price,
  StockAdjustmentReason,
  StockMovementDelta,
  StockMovementLengthMm,
  StockMovementQuantity,
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
 * `NumberField` holds an empty control as `NaN`, so an optional numeric field is its schema leaf or
 * `NaN`. Every rule beyond that emptiness — sign, bounds, decimal places — stays owned by
 * `@pkg/schema`, since `NumberField` renders a text input and enforces none of it in the browser.
 */
const optionalNumber = <TSchema extends z.ZodType>(schema: TSchema) => z.union([z.nan(), schema]);

/** A movement's length bucket is only meaningful on a linear Part; `refineLengthForPart` requires it there. */
const StockMovementLengthValue = optionalNumber(StockMovementLengthMm);

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
  delta: StockMovementDelta,
  lengthMm: StockMovementLengthValue,
  note: z.string(),
  partId: requiredSelection(UUID, 'Select a Part'),
  reason: StockAdjustmentReason,
  unitCost: optionalNumber(Price),
});

export type StockRevaluationFormValues = z.infer<typeof StockRevaluationFormValues>;
export const StockRevaluationFormValues = z.object({
  note: z.string(),
  partId: requiredSelection(UUID, 'Select a Part'),
  unitCost: InventoryUnitCost,
});

export type StockJobMovementFormValues = z.infer<typeof StockJobMovementFormValues>;
export const StockJobMovementFormValues = z.object({
  jobId: requiredSelection(UUID, 'Select a Job'),
  lengthMm: StockMovementLengthValue,
  partId: requiredSelection(UUID, 'Select a Part'),
  quantity: StockMovementQuantity,
});

/** Closing out asserts a fact about the whole Job, so the note is all the screen has left to ask. */
export type JobCloseOutFormValues = z.infer<typeof JobCloseOutFormValues>;
export const JobCloseOutFormValues = z.object({ note: z.string() });

/** The build's own field is its size; consumption is edited row-by-row outside the form schema. */
export type StockBuildFormValues = z.infer<typeof StockBuildFormValues>;
export const StockBuildFormValues = z.object({ quantity: StockMovementQuantity });

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

export function toCloseOutJobInput(jobId: UUID, values: JobCloseOutFormValues) {
  return CloseOutJobInput.parse({ jobId, note: values.note });
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
