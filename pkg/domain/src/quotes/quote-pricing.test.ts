import { describe, expect, it } from 'vitest';

import { computeQuoteTotal, validateDiscount } from './quote-pricing.js';

describe('validateDiscount', () => {
  it.each([0, 100])('allows discount amount %s inside the base price', (discountAmount) => {
    expect(validateDiscount({ basePrice: 100, discountAmount })).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it('rejects a discount amount above the base price', () => {
    expect(validateDiscount({ basePrice: 100, discountAmount: 101 })).toMatchObject({
      allowed: false,
    });
  });

  it('rejects a negative discount amount', () => {
    expect(validateDiscount({ basePrice: 100, discountAmount: -1 })).toMatchObject({
      allowed: false,
    });
  });
});

describe('computeQuoteTotal', () => {
  it('subtracts the fixed discount amount from the quoted base price', () => {
    expect(computeQuoteTotal({ quotedBasePrice: 1250, discountAmount: 200 })).toBe(1050);
  });

  it('adds delivery price when delivery is included', () => {
    expect(
      computeQuoteTotal({ deliveryIncluded: true, deliveryPrice: 350, quotedBasePrice: 1250, discountAmount: 200 }),
    ).toBe(1400);
  });

  it('adds selected optional assembly snapshot prices', () => {
    expect(
      computeQuoteTotal({
        discountAmount: 200,
        quotedBasePrice: 1250,
        selectedAssemblyPrices: [300, 150],
      }),
    ).toBe(1500);
  });

  it('ignores delivery price when delivery is excluded', () => {
    expect(
      computeQuoteTotal({ deliveryIncluded: false, deliveryPrice: 350, quotedBasePrice: 1250, discountAmount: 200 }),
    ).toBe(1050);
  });

  it('floors stale draft totals at zero when product pricing drops below the discount amount', () => {
    expect(
      computeQuoteTotal({ deliveryIncluded: true, deliveryPrice: 50, quotedBasePrice: 100, discountAmount: 125 }),
    ).toBe(50);
  });
});
