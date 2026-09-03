import { describe, expect, it } from 'vitest';

import { deriveCommitment } from './commitment.js';

describe('deriveCommitment', () => {
  it.each([
    { cfoQuantity: 10, drawnQuantity: 0, expected: 10, label: 'starts at the full CFO' },
    { cfoQuantity: 10, drawnQuantity: 4, expected: 6, label: 'decays as stock is drawn' },
    { cfoQuantity: 10, drawnQuantity: 2, expected: 8, label: 're-opens when a return reduces the net draw' },
    { cfoQuantity: 10, drawnQuantity: 12, expected: 0, label: 'clamps an overdraw at zero' },
    { cfoQuantity: 0, drawnQuantity: 3, expected: 0, label: 'keeps off-CFO draws uncommitted' },
    { cfoQuantity: 10, drawnQuantity: -2, expected: 12, label: 'reflects an over-return on a live Job' },
  ])('$label', ({ cfoQuantity, drawnQuantity, expected }) => {
    expect(deriveCommitment({ cfoQuantity, drawnQuantity })).toBe(expected);
  });

  it('stays zero after close-out regardless of later movements', () => {
    expect(deriveCommitment({ cfoQuantity: 10, drawnQuantity: 2, isClosedOut: true })).toBe(0);
    expect(deriveCommitment({ cfoQuantity: 10, drawnQuantity: -2, isClosedOut: true })).toBe(0);
  });
});
