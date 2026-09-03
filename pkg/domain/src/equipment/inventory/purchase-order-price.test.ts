import { describe, expect, it } from 'vitest';

import { defaultPurchaseOrderUnitPrice } from './purchase-order-price.js';

describe('defaultPurchaseOrderUnitPrice', () => {
  it('uses a discrete Part moving average as the editable PO default', () => {
    expect(defaultPurchaseOrderUnitPrice({ averageUnitCost: 0.3, standardPurchaseLengthMm: null })).toBe(0.3);
  });

  it('converts a linear Part per-millimetre average to its standard purchase length', () => {
    expect(defaultPurchaseOrderUnitPrice({ averageUnitCost: 0.038125, standardPurchaseLengthMm: 6_000 })).toBe(228.75);
  });

  it('keeps a never-costed Part on the unpriced sentinel', () => {
    expect(defaultPurchaseOrderUnitPrice({ averageUnitCost: null, standardPurchaseLengthMm: null })).toBe(0);
  });

  it('rounds a moving average to the PO currency precision', () => {
    expect(defaultPurchaseOrderUnitPrice({ averageUnitCost: 10.075, standardPurchaseLengthMm: null })).toBe(10.08);
  });
});
