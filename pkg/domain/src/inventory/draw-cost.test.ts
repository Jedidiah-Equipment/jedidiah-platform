import { describe, expect, it } from 'vitest';

import { deriveOutstandingDrawUnitCost, type JobDrawMovement } from './draw-cost.js';

function checkout(quantity: number, unitCost: number | null): JobDrawMovement {
  return { delta: -quantity, unitCost };
}

function returnToStore(quantity: number, unitCost: number | null): JobDrawMovement {
  return { delta: quantity, unitCost };
}

describe('deriveOutstandingDrawUnitCost', () => {
  it('has no cost to reverse when nothing was drawn', () => {
    expect(deriveOutstandingDrawUnitCost([], 1)).toBeNull();
  });

  it('reverses a single draw at the cost it left with', () => {
    expect(deriveOutstandingDrawUnitCost([checkout(4, 25)], 2)).toBe(25);
  });

  it('weights the reversal across draws made at different costs', () => {
    expect(deriveOutstandingDrawUnitCost([checkout(2, 10), checkout(2, 30)], 1)).toBe(20);
  });

  it('keeps the surviving draw cost after an earlier one is partly returned', () => {
    expect(deriveOutstandingDrawUnitCost([checkout(2, 10), checkout(2, 30), returnToStore(1, 20)], 1)).toBe(20);
  });

  it('prices a later draw from its own stamp once the pool has fully emptied', () => {
    const movements = [checkout(2, 10), returnToStore(2, 10), checkout(3, 40)];

    expect(deriveOutstandingDrawUnitCost(movements, 1)).toBe(40);
  });

  it('stays uncosted while an unpriced draw is still outstanding', () => {
    expect(deriveOutstandingDrawUnitCost([checkout(2, null), checkout(2, 30)], 1)).toBeNull();
  });

  it('recovers a cost once the unpriced draw has been fully returned', () => {
    const movements = [checkout(2, null), returnToStore(2, null), checkout(2, 30)];

    expect(deriveOutstandingDrawUnitCost(movements, 1)).toBe(30);
  });

  it('spreads only the outstanding value over an over-return', () => {
    // 2 pieces drawn at 30 are worth 60; returning 4 must not invent value for the extra 2.
    expect(deriveOutstandingDrawUnitCost([checkout(2, 30)], 4)).toBe(15);
  });

  it('has nothing left to price once everything drawn is back on the shelf', () => {
    expect(deriveOutstandingDrawUnitCost([checkout(2, 30), returnToStore(2, 30)], 1)).toBeNull();
  });

  it('prices linear draws from their length-scaled piece stamps', () => {
    // A 6 m piece at 0.01/mm stamps 60 per piece; a 3 m piece stamps 30.
    expect(deriveOutstandingDrawUnitCost([checkout(1, 60), checkout(1, 30)], 1)).toBe(45);
  });
});
