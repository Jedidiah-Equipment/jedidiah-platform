import { describe, expect, it } from 'vitest';

import { deriveMovingAverage, valueStockBucket, valueStockMovement } from './moving-average.js';

describe('deriveMovingAverage', () => {
  it('returns null until a cost-bearing movement establishes a cost', () => {
    expect(
      deriveMovingAverage([
        { delta: -1, lengthMm: null, movementType: 'adjustment', reason: 'damage', unitCost: null },
      ]),
    ).toBeNull();
  });

  it('weights a later receipt against stock remaining after quantity-only movements', () => {
    expect(
      deriveMovingAverage([
        {
          delta: 10,
          lengthMm: null,
          movementType: 'adjustment',
          reason: 'opening-balance',
          unitCost: 10,
        },
        { delta: -5, lengthMm: null, movementType: 'adjustment', reason: 'damage', unitCost: null },
        { delta: 5, lengthMm: null, movementType: 'receipt', reason: null, unitCost: 20 },
      ]),
    ).toBe(15);
  });

  it('leaves the average undisturbed when a return to the Supplier takes stock back out', () => {
    // Stock came in at 10 and at 20 (average 15); sending the dearer pieces back at their own
    // stamped 20 must not reprice what is still on the shelf, which arrived at exactly those prices.
    const movements = [
      { delta: 10, lengthMm: null, movementType: 'receipt', reason: null, unitCost: 10 },
      { delta: 10, lengthMm: null, movementType: 'receipt', reason: null, unitCost: 20 },
    ] as const;

    expect(deriveMovingAverage([...movements])).toBe(15);
    expect(
      deriveMovingAverage([
        ...movements,
        { delta: -4, lengthMm: null, movementType: 'return-to-supplier', reason: 'defective', unitCost: 20 },
      ]),
    ).toBe(15);
  });

  it('weights a later receipt against the stock a return to the Supplier left behind', () => {
    // 10 in at 10, 8 sent back, 2 left; the next 2 at 30 weight against those 2, not the original 10.
    expect(
      deriveMovingAverage([
        { delta: 10, lengthMm: null, movementType: 'receipt', reason: null, unitCost: 10 },
        { delta: -8, lengthMm: null, movementType: 'return-to-supplier', reason: 'wrong-item', unitCost: 10 },
        { delta: 2, lengthMm: null, movementType: 'receipt', reason: null, unitCost: 30 },
      ]),
    ).toBe(20);
  });

  it('resets the average when a cost-bearing row leaves non-positive stock', () => {
    expect(
      deriveMovingAverage([
        {
          delta: 10,
          lengthMm: null,
          movementType: 'adjustment',
          reason: 'opening-balance',
          unitCost: 10,
        },
        {
          delta: -15,
          lengthMm: null,
          movementType: 'adjustment',
          reason: 'opening-balance',
          unitCost: 20,
        },
      ]),
    ).toBe(20);
  });

  it('uses a revaluation as the new moving average', () => {
    expect(
      deriveMovingAverage([
        {
          delta: 10,
          lengthMm: null,
          movementType: 'adjustment',
          reason: 'opening-balance',
          unitCost: 10,
        },
        { delta: 0, lengthMm: null, movementType: 'revaluation', reason: null, unitCost: 17.5 },
      ]),
    ).toBe(17.5);
  });

  it('derives a per-mm average and values a linear length bucket', () => {
    const averagePerMm = deriveMovingAverage([
      {
        delta: 2,
        lengthMm: 6_000,
        movementType: 'adjustment',
        reason: 'opening-balance',
        unitCost: 600,
      },
      { delta: 1, lengthMm: 3_000, movementType: 'receipt', reason: null, unitCost: 360 },
    ]);

    expect(averagePerMm).toBeCloseTo(0.104, 10);
    expect(valueStockBucket({ averageUnitCost: averagePerMm, lengthMm: 5_000, quantity: 3 })).toBeCloseTo(1_560, 10);
  });

  it('weights returned stock back in at its stamped draw cost', () => {
    expect(
      deriveMovingAverage([
        {
          delta: 10,
          lengthMm: null,
          movementType: 'adjustment',
          reason: 'opening-balance',
          unitCost: 10,
        },
        { delta: -5, lengthMm: null, movementType: 'checkout', reason: null, unitCost: 10 },
        { delta: 5, lengthMm: null, movementType: 'receipt', reason: null, unitCost: 20 },
        { delta: 5, lengthMm: null, movementType: 'return-to-store', reason: null, unitCost: 10 },
      ]),
    ).toBeCloseTo(40 / 3, 10);
  });
});

describe('valueStockMovement', () => {
  it('preserves a cost-bearing linear movement value instead of substituting the new average', () => {
    expect(
      valueStockMovement({
        averageUnitCost: 0.104,
        delta: 1,
        lengthMm: 3_000,
        unitCost: 360,
      }),
    ).toBe(360);
  });

  it('uses the contemporaneous average for quantity-only movements', () => {
    expect(
      valueStockMovement({
        averageUnitCost: 0.104,
        delta: -1,
        lengthMm: 3_000,
        unitCost: null,
      }),
    ).toBeCloseTo(-312, 10);
  });
});
