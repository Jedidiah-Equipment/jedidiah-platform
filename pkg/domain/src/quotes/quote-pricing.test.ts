import { describe, expect, it } from 'vitest';

import { computeQuoteDiscountAmount, computeQuoteTotal, validateDiscount } from './quote-pricing.js';

describe('validateDiscount', () => {
  it.each([0, 100])('allows discount percent %s', (discountPercent) => {
    expect(validateDiscount({ discountPercent })).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it('rejects a discount percent above 100', () => {
    expect(validateDiscount({ discountPercent: 101 })).toMatchObject({
      allowed: false,
    });
  });

  it('rejects a negative discount percent', () => {
    expect(validateDiscount({ discountPercent: -1 })).toMatchObject({
      allowed: false,
    });
  });
});

describe('computeQuoteDiscountAmount', () => {
  it('discounts the product plus selected optional assemblies', () => {
    expect(
      computeQuoteDiscountAmount({
        discountPercent: 10,
        quotedBasePrice: 1250,
        selectedAssemblyPrices: [300, 150],
      }),
    ).toBe(170);
  });

  it('rounds the derived currency amount to cents', () => {
    expect(computeQuoteDiscountAmount({ discountPercent: 12.5, quotedBasePrice: 99.99 })).toBe(12.5);
  });
});

describe('computeQuoteTotal', () => {
  it('subtracts the discount percent from the quoted base price', () => {
    expect(computeQuoteTotal({ quotedBasePrice: 1250, discountPercent: 10 })).toBe(1125);
  });

  it('adds delivery price when delivery is included', () => {
    expect(
      computeQuoteTotal({ deliveryIncluded: true, deliveryPrice: 350, quotedBasePrice: 1250, discountPercent: 10 }),
    ).toBe(1475);
  });

  it('discounts selected optional assembly snapshot prices', () => {
    expect(
      computeQuoteTotal({
        discountPercent: 10,
        quotedBasePrice: 1250,
        selectedAssemblyPrices: [300, 150],
      }),
    ).toBe(1530);
  });

  it('ignores delivery price when delivery is excluded', () => {
    expect(
      computeQuoteTotal({ deliveryIncluded: false, deliveryPrice: 350, quotedBasePrice: 1250, discountPercent: 10 }),
    ).toBe(1125);
  });

  it('keeps delivery undiscounted when the commercial subtotal is fully discounted', () => {
    expect(
      computeQuoteTotal({ deliveryIncluded: true, deliveryPrice: 50, quotedBasePrice: 100, discountPercent: 100 }),
    ).toBe(50);
  });
});
