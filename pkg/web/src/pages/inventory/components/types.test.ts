import type { StockOnHandRow } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  deriveStockBuildRows,
  deriveStockBuildWarnings,
  partOptionsAllowing,
  partQuantityValidationMessage,
  type StockPartOption,
  stockAdjustmentValidator,
  stockJobMovementValidator,
  toAdjustmentInput,
  toBuildInput,
  toCloseOutJobInput,
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
const measured: StockPartOption = {
  isInternallyFabricated: false,
  partCode: 'RAW-200',
  partId: '00000000-0000-4000-8000-000000000003',
  partName: 'Powder',
  standardPurchaseLengthMm: null,
  unitOfMeasure: 'kg',
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

  it('accepts decimal measured stock and rejects fractional whole-unit stock before submission', () => {
    const validator = stockAdjustmentValidator([piece, linear, measured]);

    expect(
      validator.safeParse({ ...adjustment, delta: 1.125, lengthMm: Number.NaN, partId: measured.partId }).success,
    ).toBe(true);
    expect(
      validator.safeParse({ ...adjustment, delta: 1.125, lengthMm: Number.NaN, partId: piece.partId }).success,
    ).toBe(false);
    expect(validator.safeParse({ ...adjustment, delta: 1.0005 }).success).toBe(false);
    expect(validator.safeParse({ ...adjustment, lengthMm: 6_000.5 }).success).toBe(false);
    expect(partQuantityValidationMessage({ partId: piece.partId, quantity: 1.125 }, [piece])).toBe(
      'This Part is counted in whole units',
    );
    expect(partQuantityValidationMessage({ partId: measured.partId, quantity: 1.125 }, [measured])).toBeUndefined();
  });

  it('stays quiet on an empty quantity, which is unkeyed rather than fractional', () => {
    expect(partQuantityValidationMessage({ partId: piece.partId, quantity: Number.NaN }, [piece])).toBeUndefined();

    // The field rule staying quiet does not let an unkeyed quantity through either submit.
    expect(stockAdjustmentValidator([piece]).safeParse({ ...adjustment, delta: Number.NaN }).success).toBe(false);
    expect(
      stockJobMovementValidator([piece]).safeParse({
        jobId: '00000000-0000-4000-8000-000000000009',
        lengthMm: Number.NaN,
        partId: piece.partId,
        quantity: Number.NaN,
      }).success,
    ).toBe(false);
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

  it('holds a quantity to three decimals, the ledger rule, not just to a positive number', () => {
    const validator = stockJobMovementValidator([piece, linear, measured]);
    const values = { jobId: piece.partId, lengthMm: Number.NaN, partId: piece.partId, quantity: 1.125 };

    expect(validator.safeParse(values).success).toBe(false);
    expect(validator.safeParse({ ...values, partId: measured.partId }).success).toBe(true);
    expect(validator.safeParse({ ...values, quantity: 1.0005 }).success).toBe(false);
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

  it('offers only the Parts the named action allows', () => {
    // Which Parts each action allows is `derivePartStockActions`; this is the wiring to it.
    const periodic = stockRow({ stockTrackingMode: 'periodic' });

    expect(partOptionsAllowing([periodic], 'checkout')).toEqual([]);
    expect(partOptionsAllowing([periodic], 'receive')).toEqual([linear]);
    expect(partOptionsAllowing([stockRow()], 'checkout')).toEqual([linear]);
  });
});

describe('toCloseOutJobInput', () => {
  const jobId = '00000000-0000-4000-8000-000000000001';

  it('drops an empty or whitespace-only note rather than storing a blank one', () => {
    expect(toCloseOutJobInput(jobId, { note: '   ' })).toEqual({ jobId, note: null });
  });

  it('trims a note the closer actually wrote', () => {
    expect(toCloseOutJobInput(jobId, { note: '  Two bars back in bin A  ' })).toEqual({
      jobId,
      note: 'Two bars back in bin A',
    });
  });
});

describe('stock build rows', () => {
  const BOLT = '00000000-0000-4000-8000-00000000000b';
  const PLATE = '00000000-0000-4000-8000-00000000000c';
  const ASSEMBLY = '00000000-0000-4000-8000-00000000000a';
  const bomLines = [
    { componentPartId: BOLT, quantity: 4 },
    { componentPartId: PLATE, quantity: 2 },
  ];
  const items: StockOnHandRow[] = [
    stockRow({
      buckets: [{ lengthMm: null, quantity: 100, totalValue: 250 }],
      partId: BOLT,
      standardPurchaseLengthMm: null,
      unitOfMeasure: 'piece',
    }),
    stockRow({
      buckets: [{ lengthMm: 6_000, quantity: 1, totalValue: 60 }],
      partId: PLATE,
      standardPurchaseLengthMm: 6_000,
      stockTrackingMode: 'periodic',
      unitOfMeasure: 'mm',
    }),
  ];

  it('prefills at BOM times the build size and takes the linear standard bucket', () => {
    const rows = deriveStockBuildRows({ bomLines, items, values: { consumption: {}, quantity: 3 } });

    expect(rows).toEqual([
      expect.objectContaining({ componentPartId: BOLT, expectedQuantity: 12, keyedQuantity: '12', lengthMm: null }),
      expect.objectContaining({ componentPartId: PLATE, expectedQuantity: 6, keyedQuantity: '6', lengthMm: 6_000 }),
    ]);
  });

  it('re-prefills untouched rows when the build size changes, and keeps the edited ones', () => {
    const edited = { consumption: { [BOLT]: '9' }, quantity: 1 };
    expect(deriveStockBuildRows({ bomLines, items, values: edited }).map((row) => row.keyedQuantity)).toEqual([
      '9',
      '2',
    ]);

    const resized = { ...edited, quantity: 5 };
    expect(deriveStockBuildRows({ bomLines, items, values: resized }).map((row) => row.keyedQuantity)).toEqual([
      '9',
      '10',
    ]);
  });

  it('agrees with the ledger about a periodic component: deviation reads, a short rack does not', () => {
    // The plate is periodic and only 1 piece is on hand, but 6 are keyed. The server posts nothing
    // for it and never calls its rack short, so the screen must not either.
    const rows = deriveStockBuildRows({ bomLines, items, values: { consumption: {}, quantity: 3 } });
    expect(deriveStockBuildWarnings({ bomLines, quantity: 3, rows })).toEqual([]);

    const deviating = deriveStockBuildRows({ bomLines, items, values: { consumption: { [PLATE]: '7' }, quantity: 3 } });
    expect(deriveStockBuildWarnings({ bomLines, quantity: 3, rows: deviating })).toEqual(['bom-deviation']);
  });

  it('drops a zeroed row rather than posting a zero-quantity movement', () => {
    const rows = deriveStockBuildRows({ bomLines, items, values: { consumption: { [BOLT]: '0' }, quantity: 1 } });

    expect(toBuildInput(ASSEMBLY, rows, 1).consumption).toEqual([
      { componentPartId: PLATE, lengthMm: 6_000, quantity: 2 },
    ]);
  });
});
