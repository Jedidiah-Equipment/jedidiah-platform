import { describe, expect, it } from 'vitest';

import { ProductCostEstimateMaterialLine } from './product-cost-estimate.js';

const partId = '00000000-0000-4000-8000-000000000001';

describe('cost estimate line standard purchase length', () => {
  it('reads a Job snapshot stamped before the length was carried, rather than refusing it', () => {
    const storedBeforeTheField = {
      costFloor: 304,
      partCode: 'LTE-0027',
      partId,
      partName: '7 Core Cable',
      quantityPerUnit: 8,
      unitCost: 38,
      unitOfMeasure: 'mm',
    };

    expect(ProductCostEstimateMaterialLine.parse(storedBeforeTheField)).toMatchObject({
      standardPurchaseLengthMm: null,
    });
  });
});
