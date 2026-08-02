import {
  type JobStockRow,
  PostAdjustmentInput,
  PostCheckoutInput,
  PostRevaluationInput,
  type StockAdjustmentReason,
  type StockOnHandRow,
} from '@pkg/schema';

export type StockPartOption = Pick<
  StockOnHandRow,
  'isInternallyFabricated' | 'partCode' | 'partId' | 'partName' | 'standardPurchaseLengthMm' | 'unitOfMeasure'
>;

export type AdjustmentFormValues = {
  delta: string;
  lengthMm: string;
  note: string;
  partId: string;
  reason: StockAdjustmentReason;
  unitCost: string;
};

export type RevaluationFormValues = {
  note: string;
  partId: string;
  unitCost: string;
};

export type JobMovementFormValues = {
  jobId: string;
  lengthMm: string;
  partId: string;
  quantity: string;
};

export type JobMovementWarningCode = 'exceeds-cfo' | 'exceeds-drawn' | 'negative-stock-on-hand';

export function parseAdjustmentForm({
  canReadCost,
  part,
  values,
}: {
  canReadCost: boolean;
  part: StockPartOption;
  values: AdjustmentFormValues;
}) {
  return PostAdjustmentInput.safeParse({
    delta: requiredNumber(values.delta),
    lengthMm: part.unitOfMeasure === 'mm' ? requiredNumber(values.lengthMm) : null,
    note: values.note,
    partId: part.partId,
    reason: values.reason,
    unitCost:
      canReadCost && !part.isInternallyFabricated && values.reason === 'opening-balance'
        ? optionalNumber(values.unitCost)
        : null,
  });
}

export function parseRevaluationForm(values: RevaluationFormValues) {
  return PostRevaluationInput.safeParse({
    note: values.note,
    partId: values.partId,
    unitCost: requiredNumber(values.unitCost),
  });
}

export function parseJobMovementForm({ part, values }: { part: StockPartOption; values: JobMovementFormValues }) {
  return PostCheckoutInput.safeParse({
    jobId: values.jobId,
    lengthMm: part.unitOfMeasure === 'mm' ? requiredNumber(values.lengthMm) : null,
    partId: part.partId,
    quantity: requiredNumber(values.quantity),
  });
}

export function deriveJobMovementWarnings({
  jobStock,
  lengthMm,
  part,
  quantity,
  stockOnHand,
  type,
}: {
  jobStock: JobStockRow | undefined;
  lengthMm: number | null;
  part: StockPartOption;
  quantity: number;
  stockOnHand: readonly StockOnHandRow[];
  type: 'checkout' | 'return-to-store';
}): JobMovementWarningCode[] {
  if (type === 'return-to-store') {
    const drawnQuantity =
      lengthMm === null
        ? (jobStock?.drawnQuantity ?? 0)
        : (jobStock?.lengthBuckets.find((bucket) => bucket.lengthMm === lengthMm)?.drawnQuantity ?? 0);
    return quantity > drawnQuantity ? ['exceeds-drawn'] : [];
  }

  const warnings: JobMovementWarningCode[] = [];
  if ((jobStock?.drawnQuantity ?? 0) + quantity > (jobStock?.cfoQuantity ?? 0)) {
    warnings.push('exceeds-cfo');
  }

  const bucketQuantity =
    stockOnHand.find((row) => row.partId === part.partId && row.lengthMm === lengthMm)?.quantity ?? 0;
  if (bucketQuantity - quantity < 0) {
    warnings.push('negative-stock-on-hand');
  }
  return warnings;
}

export function distinctPartOptions(items: readonly StockOnHandRow[]): StockPartOption[] {
  const byId = new Map(items.map((item) => [item.partId, item]));
  return [...byId.values()].map(
    ({ isInternallyFabricated, partCode, partId, partName, standardPurchaseLengthMm, unitOfMeasure }) => ({
      isInternallyFabricated,
      partCode,
      partId,
      partName,
      standardPurchaseLengthMm,
      unitOfMeasure,
    }),
  );
}

export function perpetualPartOptions(items: readonly StockOnHandRow[]): StockPartOption[] {
  return distinctPartOptions(items.filter((item) => item.stockTrackingMode === 'perpetual'));
}

export function revaluablePartOptions(parts: readonly StockPartOption[]): StockPartOption[] {
  return parts.filter((part) => !part.isInternallyFabricated);
}

function requiredNumber(value: string): number {
  return value === '' ? Number.NaN : Number(value);
}

function optionalNumber(value: string): number | null {
  return value === '' ? null : Number(value);
}
