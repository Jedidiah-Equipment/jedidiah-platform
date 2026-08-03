import { type BuildBomLine, deriveBuildConsumption, deriveBuildWarnings } from '@pkg/domain';
import {
  CloseOutJobInput,
  InventoryUnitCost,
  isWholeUnitQuantity,
  PostAdjustmentInput,
  PostBuildInput,
  PostJobMovementInput,
  PostRevaluationInput,
  Price,
  StockAdjustmentReason,
  StockMovementDelta,
  StockMovementLengthMm,
  StockMovementQuantity,
  type StockMovementWarningCode,
  type StockOnHandRow,
  UUID,
  unitClassFor,
} from '@pkg/schema';
import { z } from 'zod';

import { optionalNumber, requiredSelection } from '@/components/form/utils/form-schema.js';

export type StockPartOption = Pick<
  StockOnHandRow,
  'isInternallyFabricated' | 'partCode' | 'partId' | 'partName' | 'standardPurchaseLengthMm' | 'unitOfMeasure'
>;

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

function refineQuantityForPart(
  values: { partId: string; quantity: number },
  parts: readonly StockPartOption[],
  path: 'delta' | 'quantity',
  context: z.RefinementCtx,
): void {
  const part = parts.find((candidate) => candidate.partId === values.partId);
  if (!part || isWholeUnitQuantity(values.quantity, unitClassFor(part.unitOfMeasure))) return;

  context.addIssue({
    code: 'custom',
    message: 'This Part is counted in whole units',
    path: [path],
  });
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

/**
 * The build's size and its consumption rows. The rows live in the form rather than beside it so one
 * subscription drives the rows, the warnings and the submit label — none of them needs a stand-in
 * build size to be computed early. The Built Part stays outside: it is the BOM query's key.
 *
 * `consumption` is keyed by component Part id and holds what the builder typed, unparsed: a row is
 * a text control, and a half-typed "1." is not yet a number.
 */
export type StockBuildFormValues = z.infer<typeof StockBuildFormValues>;
export const StockBuildFormValues = z
  .object({
    consumption: z.record(z.string(), z.string()),
    quantity: StockMovementQuantity,
  })
  .superRefine((values, context) => {
    for (const [componentPartId, keyed] of Object.entries(values.consumption)) {
      const quantity = Number(keyed);

      if (keyed.trim() === '' || !Number.isFinite(quantity) || quantity < 0) {
        context.addIssue({
          code: 'custom',
          message: 'Enter a quantity of zero or more. Zero drops the line.',
          path: ['consumption', componentPartId],
        });
      }
    }
  });

/** One consumption row, carrying everything the screen renders and the ledger is asked to judge. */
export type StockBuildRow = {
  componentPartId: string;
  /** BOM quantity × build size: what the row prefilled to, and what a deviation is measured from. */
  expectedQuantity: number;
  /** Raw material. Its line posts nothing, so its rack is never called short (spec §6). */
  isInformational: boolean;
  /** What the builder typed, as typed — the row is a text control. */
  keyedQuantity: string;
  lengthMm: number | null;
  quantityOnHand: number;
};

/**
 * The build's rows, prefilled from the BOM at the size being built and overridden by whatever the
 * builder has keyed. Held as overrides rather than a copied list, so changing the build size
 * re-prefills every row nobody has touched without discarding the ones they have.
 */
export function deriveStockBuildRows({
  bomLines,
  items,
  values,
}: {
  bomLines: readonly BuildBomLine[];
  items: readonly StockOnHandRow[];
  values: Pick<StockBuildFormValues, 'consumption' | 'quantity'>;
}): StockBuildRow[] {
  const quantity = Number.isFinite(values.quantity) ? values.quantity : 0;

  return deriveBuildConsumption({ bomLines, quantity }).map((line) => {
    const item = items.find((candidate) => candidate.partId === line.componentPartId);
    // Linear components come out of their standard purchase bucket unless the builder says otherwise.
    const lengthMm = item?.unitOfMeasure === 'mm' ? item.standardPurchaseLengthMm : null;

    return {
      componentPartId: line.componentPartId,
      expectedQuantity: line.quantity,
      isInformational: item?.stockTrackingMode === 'periodic',
      keyedQuantity: values.consumption[line.componentPartId] ?? String(line.quantity),
      lengthMm,
      quantityOnHand: item?.buckets.find((bucket) => bucket.lengthMm === lengthMm)?.quantity ?? 0,
    };
  });
}

/**
 * The same judgement the ledger applies on post, run against what this screen has loaded so the
 * builder sees it before committing rather than only afterwards.
 */
export function deriveStockBuildWarnings(rows: readonly StockBuildRow[]): StockMovementWarningCode[] {
  return [
    ...new Set(
      rows.flatMap((row) =>
        deriveBuildWarnings({
          expectedQuantity: row.expectedQuantity,
          isInformational: row.isInformational,
          quantity: Number(row.keyedQuantity),
          quantityOnHand: row.quantityOnHand,
        }),
      ),
    ),
  ];
}

/** A row the builder zeroed means none of it left the rack — a dropped line, not a zero movement. */
export function toBuildInput(builtPartId: string, rows: readonly StockBuildRow[], quantity: number): PostBuildInput {
  return PostBuildInput.parse({
    builtPartId,
    consumption: rows
      .map((row) => ({
        componentPartId: row.componentPartId,
        lengthMm: row.lengthMm,
        quantity: Number(row.keyedQuantity),
      }))
      .filter((line) => line.quantity > 0),
    quantity,
  });
}

/** Adds the per-Part rules a flat form schema cannot express on its own. */
export function stockAdjustmentValidator(parts: readonly StockPartOption[]) {
  return StockAdjustmentFormValues.superRefine((values, context) => {
    refineLengthForPart(values, parts, context);
    refineQuantityForPart({ partId: values.partId, quantity: values.delta }, parts, 'delta', context);

    // Mirrors PostAdjustmentInput so the rule reads as a field error rather than a failed request.
    if (values.reason !== 'opening-balance' && values.note.trim() === '') {
      context.addIssue({ code: 'custom', message: 'A note is required for this adjustment reason', path: ['note'] });
    }
  });
}

export function stockJobMovementValidator(parts: readonly StockPartOption[]) {
  return StockJobMovementFormValues.superRefine((values, context) => {
    refineLengthForPart(values, parts, context);
    refineQuantityForPart(values, parts, 'quantity', context);
  });
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
