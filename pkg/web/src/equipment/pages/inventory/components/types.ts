import {
  type BuildBomLine,
  deriveBuildConsumption,
  deriveMovementWarnings,
  derivePartStockActions,
  parseScanToken,
} from '@pkg/domain/equipment';
import { Price, UUID } from '@pkg/schema';
import {
  CloseOutJobInput,
  InventoryUnitCost,
  isWholeUnitQuantity,
  type PartStockActions,
  PostAdjustmentInput,
  PostBuildInput,
  PostCheckoutInput,
  PostJobMovementInput,
  PostReturnToStoreInput,
  PostRevaluationInput,
  StockAdjustmentReason,
  StockMovementDelta,
  StockMovementLengthMm,
  StockMovementQuantity,
  type StockMovementWarningCode,
  type StockOnHandRow,
  unitClassFor,
} from '@pkg/schema/equipment';
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
  const message = partQuantityValidationMessage(values, parts);
  if (!message) return;

  context.addIssue({
    code: 'custom',
    message,
    path: [path],
  });
}

export function partQuantityValidationMessage(
  values: { partId: string; quantity: number },
  parts: readonly StockPartOption[],
): string | undefined {
  const part = parts.find((candidate) => candidate.partId === values.partId);
  // An empty field holds NaN, which is not a whole number — but "unkeyed" is the schema's own
  // complaint to make, not a unit-class violation to report against a quantity nobody typed.
  if (!part || !Number.isFinite(values.quantity)) return undefined;

  return isWholeUnitQuantity(values.quantity, unitClassFor(part.unitOfMeasure))
    ? undefined
    : 'This Part is counted in whole units';
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

export type StockMovementTargetMode = z.infer<typeof StockMovementTargetMode>;
export const StockMovementTargetMode = z.enum(['job', 'person']);

export type StockMovementFormValues = z.infer<typeof StockMovementFormValues>;
export const StockMovementFormValues = z.object({
  jobId: z.string(),
  lengthMm: StockMovementLengthValue,
  mode: StockMovementTargetMode,
  note: z.string(),
  partId: z.string(),
  quantity: StockMovementQuantity,
  recipientUserId: z.string(),
  sourceCheckoutId: z.string(),
});

/** Clears the target arm that is no longer visible and restores the signed-in recipient default. */
export function switchStockMovementTarget({
  defaultPartId,
  movementType,
  recipientUserId,
  targetMode,
  values,
}: {
  defaultPartId: string;
  movementType: 'checkout' | 'return-to-store';
  recipientUserId: string;
  targetMode: StockMovementTargetMode;
  values: StockMovementFormValues;
}): StockMovementFormValues {
  if (targetMode === 'person') {
    return {
      ...values,
      jobId: '',
      lengthMm: movementType === 'return-to-store' ? Number.NaN : values.lengthMm,
      mode: targetMode,
      partId: movementType === 'return-to-store' ? '' : values.partId,
      recipientUserId: movementType === 'checkout' ? recipientUserId : values.recipientUserId,
    };
  }

  return {
    ...values,
    mode: targetMode,
    note: '',
    partId: movementType === 'return-to-store' ? defaultPartId : values.partId,
    recipientUserId: '',
    sourceCheckoutId: '',
  };
}

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
 * builder sees it before committing rather than only afterwards. The BOM goes in whole, not just
 * the keyed rows: a component dropped from the list deviates from the BOM as surely as an edited
 * quantity, and that half of the rule used to live where only the server could reach it.
 */
export function deriveStockBuildWarnings({
  bomLines,
  quantity,
  rows,
}: {
  bomLines: readonly BuildBomLine[];
  quantity: number;
  rows: readonly StockBuildRow[];
}): StockMovementWarningCode[] {
  const informationalByComponent = new Map(rows.map((row) => [row.componentPartId, row.isInformational]));

  return deriveMovementWarnings({
    facts: {
      bom: bomLines.map((line) => ({
        ...line,
        isInformational: informationalByComponent.get(line.componentPartId) ?? false,
      })),
      kind: 'build',
      lines: rows.map((row) => ({
        componentPartId: row.componentPartId,
        isInformational: row.isInformational,
        quantity: Number(row.keyedQuantity),
        quantityOnHand: row.quantityOnHand,
      })),
    },
    quantity: Number.isFinite(quantity) ? quantity : 0,
  });
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

export function stockMovementValidator(
  parts: readonly StockPartOption[],
  movementType: 'checkout' | 'return-to-store',
) {
  return StockMovementFormValues.superRefine((values, context) => {
    if (values.mode === 'job') {
      if (!UUID.safeParse(values.jobId).success) {
        context.addIssue({ code: 'custom', message: 'Select a Job', path: ['jobId'] });
      }
      if (!UUID.safeParse(values.partId).success) {
        context.addIssue({ code: 'custom', message: 'Select a Part', path: ['partId'] });
      } else {
        refineLengthForPart(values, parts, context);
        refineQuantityForPart(values, parts, 'quantity', context);
      }
      return;
    }

    if (movementType === 'return-to-store') {
      if (!UUID.safeParse(values.sourceCheckoutId).success) {
        context.addIssue({ code: 'custom', message: 'Select the original Checkout', path: ['sourceCheckoutId'] });
      }
      refineQuantityForPart(values, parts, 'quantity', context);
      return;
    }

    if (!UUID.safeParse(values.partId).success) {
      context.addIssue({ code: 'custom', message: 'Select a Part', path: ['partId'] });
    } else {
      refineLengthForPart(values, parts, context);
      refineQuantityForPart(values, parts, 'quantity', context);
    }
    if (values.recipientUserId.trim() === '') {
      context.addIssue({ code: 'custom', message: 'Select who received the Parts', path: ['recipientUserId'] });
    }
    if (values.note.trim() === '') {
      context.addIssue({ code: 'custom', message: 'Enter a purpose', path: ['note'] });
    }
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

/**
 * The precision a revaluation is keyed at. Undefined until a Part is chosen: rounding on the discrete
 * two decimals first would take a per-millimetre cost's decimals before the Part needing them is picked.
 */
export function revaluationCostDecimals(part: StockPartOption | undefined): number | undefined {
  if (part === undefined) return undefined;

  return part.unitOfMeasure === 'mm' ? 6 : 2;
}

export function toRevaluationInput(values: StockRevaluationFormValues) {
  return PostRevaluationInput.parse(values);
}

export function toStockMovementInput(
  values: StockMovementFormValues,
  movementType: 'checkout' | 'return-to-store',
  part: StockPartOption | undefined,
) {
  if (values.mode === 'person' && movementType === 'return-to-store') {
    return PostReturnToStoreInput.parse({ quantity: values.quantity, sourceCheckoutId: values.sourceCheckoutId });
  }
  if (!part) throw new Error('Select a Part');
  if (values.mode === 'person') {
    return PostCheckoutInput.parse({
      lengthMm: part.unitOfMeasure === 'mm' ? values.lengthMm : null,
      note: values.note,
      partId: values.partId,
      quantity: values.quantity,
      recipientUserId: values.recipientUserId,
    });
  }

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

/**
 * The Parts a stock control may be offered for, named by the action it posts. The rule is the same
 * derivation the server gates on, so a picker cannot offer a Part the post would refuse.
 */
export function partOptionsAllowing(
  items: readonly StockOnHandRow[],
  action: keyof PartStockActions,
): StockPartOption[] {
  return items.filter((item) => derivePartStockActions(item)[action].allowed).map(toStockPartOption);
}

function partSelectOption(part: StockPartOption) {
  return { label: `${part.partCode} · ${part.partName}`, value: part.partId };
}

export function partSelectOptions(parts: readonly StockPartOption[]) {
  return parts.map(partSelectOption);
}

/** Resolves the domain's Part-code Scan Token without turning partial text into a Part selection. */
export function partIdFromScanToken(parts: readonly StockPartOption[], raw: string): string | undefined {
  const token = parseScanToken(raw);
  if (token.kind !== 'part-code') return undefined;

  return parts.find((part) => part.partCode === token.partCode)?.partId;
}
