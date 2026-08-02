import {
  PostAdjustmentInput,
  PostRevaluationInput,
  type StockAdjustmentReason,
  type StockOnHandRow,
} from '@pkg/schema';

export type StockPartOption = Pick<
  StockOnHandRow,
  'isInternallyFabricated' | 'partCode' | 'partId' | 'partName' | 'unitOfMeasure'
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

export function distinctPartOptions(items: readonly StockOnHandRow[]): StockPartOption[] {
  const byId = new Map(items.map((item) => [item.partId, item]));
  return [...byId.values()].map(({ isInternallyFabricated, partCode, partId, partName, unitOfMeasure }) => ({
    isInternallyFabricated,
    partCode,
    partId,
    partName,
    unitOfMeasure,
  }));
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
