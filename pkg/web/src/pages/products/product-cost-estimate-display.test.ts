import { describe, expect, test } from 'vitest';

import { formatEstimateFloor, missingEstimateLabels } from './product-cost-estimate-display.js';

describe('Product cost estimate display', () => {
  test('labels an incomplete estimate as a floor and names every missing input', () => {
    expect(formatEstimateFloor(41_300, false)).toBe('≥ R 41 300.00');
    expect(
      missingEstimateLabels({
        laborHours: true,
        materialList: false,
        uncostedParts: [
          { partCode: 'A', partId: '00000000-0000-4000-8000-000000000001', partName: 'A' },
          { partCode: 'B', partId: '00000000-0000-4000-8000-000000000002', partName: 'B' },
        ],
      }),
    ).toEqual(['labor hours', '2 uncosted parts']);
  });
});
