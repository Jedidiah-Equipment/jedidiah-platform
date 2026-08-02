import { describe, expect, it } from 'vitest';

import { PostAdjustmentInput, PostRevaluationInput } from './stock-movement.js';

const partId = '00000000-0000-4000-8000-000000000001';

describe('stock movement inputs', () => {
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
});
