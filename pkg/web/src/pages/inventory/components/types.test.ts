import type { StockOnHandRow } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  perpetualPartOptions,
  revaluablePartOptions,
  type StockPartOption,
  stockAdjustmentValidator,
  stockJobMovementValidator,
  toAdjustmentInput,
  toJobMovementInput,
  toRevaluationInput,
  toStockPartOption,
} from './types.js';

const piece: StockPartOption = {
  isInternallyFabricated: false,
  partCode: 'P-100',
  partId: '00000000-0000-4000-8000-000000000001',
  partName: 'Bearing',
  standardPurchaseLengthMm: null,
  unitOfMeasure: 'piece',
};
const linear: StockPartOption = {
  isInternallyFabricated: false,
  partCode: 'RAW-100',
  partId: '00000000-0000-4000-8000-000000000002',
  partName: 'Channel',
  standardPurchaseLengthMm: 6_000,
  unitOfMeasure: 'mm',
};

function stockRow(overrides: Partial<StockOnHandRow> = {}): StockOnHandRow {
  return {
    asOfLastCount: null,
    averageUnitCost: 0.1,
    buckets: [{ lengthMm: 6_000, quantity: 2, totalValue: 1_200 }],
    committed: 0,
    free: 2,
    isInternallyFabricated: false,
    partCode: linear.partCode,
    partId: linear.partId,
    partName: linear.partName,
    quantity: 2,
    standardPurchaseLengthMm: 6_000,
    stockTrackingMode: 'perpetual',
    totalValue: 1_200,
    unitOfMeasure: 'mm',
    ...overrides,
  };
}

const adjustment = {
  delta: 2,
  lengthMm: 6_000,
  note: '  Go-live count  ',
  partId: linear.partId,
  reason: 'opening-balance' as const,
  unitCost: 750.5,
};

describe('stock adjustment form', () => {
  it('maps a linear opening balance, trimming its note', () => {
    expect(toAdjustmentInput(adjustment, true, linear)).toMatchObject({
      delta: 2,
      lengthMm: 6_000,
      note: 'Go-live count',
      unitCost: 750.5,
    });
  });

  it('drops the length on a Part that has no buckets and the cost from a price-blind poster', () => {
    const values = { ...adjustment, note: 'Damaged in storage', partId: piece.partId, reason: 'damage' as const };

    expect(toAdjustmentInput({ ...values, unitCost: Number.NaN }, false, piece)).toMatchObject({
      lengthMm: null,
      unitCost: null,
    });
  });

  it('never maps a cost for an internally fabricated Part', () => {
    expect(toAdjustmentInput(adjustment, true, { ...piece, isInternallyFabricated: true })).toMatchObject({
      unitCost: null,
    });
  });

  it('requires a length on a linear Part and a note on every reason but an opening balance', () => {
    const validator = stockAdjustmentValidator([piece, linear]);

    expect(validator.safeParse({ ...adjustment, lengthMm: Number.NaN }).success).toBe(false);
    expect(validator.safeParse({ ...adjustment, note: '  ', reason: 'damage' }).success).toBe(false);
    expect(validator.safeParse({ ...adjustment, note: '  ' }).success).toBe(true);
    expect(validator.safeParse({ ...adjustment, partId: '' }).success).toBe(false);
  });
});

describe('stock revaluation form', () => {
  it('maps the new cost and normalizes a blank note', () => {
    expect(toRevaluationInput({ note: '  ', partId: piece.partId, unitCost: 25.5 })).toMatchObject({
      note: null,
      partId: piece.partId,
      unitCost: 25.5,
    });
  });
});

describe('Job movement form', () => {
  it('maps a linear movement with its selected piece length', () => {
    expect(
      toJobMovementInput({ jobId: piece.partId, lengthMm: 6_000, partId: linear.partId, quantity: 2 }, linear),
    ).toMatchObject({ jobId: piece.partId, lengthMm: 6_000, partId: linear.partId, quantity: 2 });
  });

  it('needs a Job, a Part, a positive quantity, and a length for linear stock', () => {
    const validator = stockJobMovementValidator([piece, linear]);
    const values = { jobId: piece.partId, lengthMm: 6_000, partId: linear.partId, quantity: 2 };

    expect(validator.safeParse(values).success).toBe(true);
    expect(validator.safeParse({ ...values, jobId: '' }).success).toBe(false);
    expect(validator.safeParse({ ...values, quantity: 0 }).success).toBe(false);
    expect(validator.safeParse({ ...values, lengthMm: Number.NaN }).success).toBe(false);
    expect(validator.safeParse({ ...values, lengthMm: Number.NaN, partId: piece.partId }).success).toBe(true);
  });
});

describe('Part option lists', () => {
  it('reads one selectable Part from a row that holds several length buckets', () => {
    const row = stockRow({
      buckets: [
        { lengthMm: 3_000, quantity: 1, totalValue: 300 },
        { lengthMm: 6_000, quantity: 2, totalValue: 1_200 },
      ],
    });

    expect(toStockPartOption(row)).toEqual(linear);
  });

  it('removes internally fabricated Parts from revaluation choices', () => {
    expect(revaluablePartOptions([piece, { ...linear, isInternallyFabricated: true }])).toEqual([piece]);
  });

  it('excludes periodic Parts from Job movements, which they never record', () => {
    expect(perpetualPartOptions([stockRow({ stockTrackingMode: 'periodic' })])).toEqual([]);
    expect(perpetualPartOptions([stockRow()])).toEqual([linear]);
  });
});
