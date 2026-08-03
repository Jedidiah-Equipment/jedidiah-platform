import { describe, expect, it } from 'vitest';

import {
  isPeriodicStockAdjustmentReason,
  JobStockMovementType,
  PostAdjustmentInput,
  PostJobMovementInput,
  PostRevaluationInput,
  StockMovementType,
} from './stock-movement.js';

const partId = '00000000-0000-4000-8000-000000000001';

describe('stock movement inputs', () => {
  it('accepts the complete shipped movement vocabulary', () => {
    expect(StockMovementType.options).toEqual([
      'adjustment',
      'revaluation',
      'checkout',
      'return-to-store',
      'receipt',
      'build-consume',
      'build-produce',
    ]);
  });

  it('accepts adjustment deltas with up to three decimal places', () => {
    expect(
      PostAdjustmentInput.parse({
        delta: 1.125,
        partId,
        reason: 'opening-balance',
        unitCost: 42.5,
      }),
    ).toEqual({
      delta: 1.125,
      lengthMm: null,
      note: null,
      partId,
      reason: 'opening-balance',
      unitCost: 42.5,
    });

    expect(() => PostAdjustmentInput.parse({ delta: 1.1255, partId, reason: 'opening-balance' })).toThrow(
      'Delta supports at most three decimal places',
    );
  });

  it.each([
    'stock-count',
    'damage',
    'scrap',
    'correction',
  ] as const)('requires a note for a %s adjustment', (reason) => {
    expect(() => PostAdjustmentInput.parse({ delta: -1, partId, reason })).toThrow(
      'A note is required for this adjustment reason',
    );
  });

  it('allows opening balance without a note and rejects unit cost on other adjustments', () => {
    expect(PostAdjustmentInput.parse({ delta: 4, partId, reason: 'opening-balance', unitCost: 15 })).toMatchObject({
      note: null,
      unitCost: 15,
    });

    expect(() =>
      PostAdjustmentInput.parse({ delta: -1, note: 'Damaged', partId, reason: 'damage', unitCost: 15 }),
    ).toThrow('Unit cost is only valid for an opening balance');
  });

  it('takes cost but not quantity or reason when posting a revaluation', () => {
    expect(PostRevaluationInput.parse({ note: 'Supplier repriced', partId, unitCost: 0.104 })).toEqual({
      note: 'Supplier repriced',
      partId,
      unitCost: 0.104,
    });

    expect(() => PostRevaluationInput.parse({ delta: 1, partId, unitCost: 18.75 })).toThrow();
    expect(() => PostRevaluationInput.parse({ partId, reason: 'correction', unitCost: 18.75 })).toThrow();
    expect(() => PostRevaluationInput.parse({ lengthMm: null, partId, unitCost: 18.75 })).toThrow();
  });

  it('takes a positive quantity, Job, Part, and optional length for either Job movement', () => {
    expect(JobStockMovementType.options).toEqual(['checkout', 'return-to-store']);
    expect(PostJobMovementInput.parse({ jobId: partId, lengthMm: 6_000, partId, quantity: 1.125 })).toEqual({
      jobId: partId,
      lengthMm: 6_000,
      partId,
      quantity: 1.125,
    });

    expect(() => PostJobMovementInput.parse({ jobId: partId, partId, quantity: 0 })).toThrow();
    expect(() => PostJobMovementInput.parse({ jobId: partId, partId, quantity: -1 })).toThrow();
    expect(() => PostJobMovementInput.parse({ jobId: partId, partId, quantity: 1, unitCost: 12 })).toThrow();
  });

  it('limits periodic Parts to their opening balance and stock counts', () => {
    expect(isPeriodicStockAdjustmentReason('opening-balance')).toBe(true);
    expect(isPeriodicStockAdjustmentReason('stock-count')).toBe(true);

    for (const reason of ['damage', 'scrap', 'correction'] as const) {
      expect(isPeriodicStockAdjustmentReason(reason), reason).toBe(false);
    }
  });
});
