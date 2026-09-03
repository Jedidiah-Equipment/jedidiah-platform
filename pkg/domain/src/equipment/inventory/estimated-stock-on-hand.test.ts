import { describe, expect, test } from 'vitest';

import { deriveEstimatedStockOnHand, formatEstimatedStockOnHand } from './estimated-stock-on-hand.js';

describe('deriveEstimatedStockOnHand', () => {
  test('turns utilization-adjusted demand into whole plates and an open-plate remainder', () => {
    expect(
      deriveEstimatedStockOnHand({
        cumulativeDemandAtAnchor: 0,
        cumulativeDemandNow: 0.06,
        recordedOnHand: 3,
        utilization: 0.85,
      }),
    ).toEqual({ openPlateRemainingPercent: 94, wholeUnits: 2 });

    expect(
      deriveEstimatedStockOnHand({
        cumulativeDemandAtAnchor: 0,
        cumulativeDemandNow: 0.21,
        recordedOnHand: 3,
        utilization: 0.85,
      }),
    ).toEqual({ openPlateRemainingPercent: 79, wholeUnits: 2 });
  });

  test('carries the open plate across a count anchor and only subtracts later threshold crossings', () => {
    expect(
      deriveEstimatedStockOnHand({
        cumulativeDemandAtAnchor: 0.8,
        cumulativeDemandNow: 0.9,
        recordedOnHand: 4,
        utilization: 0.85,
      }),
    ).toEqual({ openPlateRemainingPercent: 95, wholeUnits: 3 });
  });

  test('shows no open plate at an exact utilization multiple and clamps whole units at zero', () => {
    expect(
      deriveEstimatedStockOnHand({
        cumulativeDemandAtAnchor: 0,
        cumulativeDemandNow: 0.85,
        recordedOnHand: 1,
        utilization: 0.85,
      }),
    ).toEqual({ openPlateRemainingPercent: null, wholeUnits: 0 });

    expect(
      deriveEstimatedStockOnHand({
        cumulativeDemandAtAnchor: 0,
        cumulativeDemandNow: 2,
        recordedOnHand: 1,
        utilization: 0.85,
      }).wholeUnits,
    ).toBe(0);
  });
});

describe('formatEstimatedStockOnHand', () => {
  test('names whole plates and the optional open-plate remainder', () => {
    expect(formatEstimatedStockOnHand({ openPlateRemainingPercent: 94, wholeUnits: 2 }, 'piece')).toBe(
      '≈ 2 plates + 94% of one.',
    );
    expect(formatEstimatedStockOnHand({ openPlateRemainingPercent: null, wholeUnits: 1 }, 'piece')).toBe('≈ 1 plate.');
    expect(formatEstimatedStockOnHand({ openPlateRemainingPercent: 60, wholeUnits: 2 }, 'box')).toBe(
      '≈ 2 boxes + 60% of one.',
    );
  });
});
