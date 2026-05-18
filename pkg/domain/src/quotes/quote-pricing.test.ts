import { describe, expect, it } from 'vitest';

import { computeQuoteTotal, validateDiscount } from './quote-pricing.js';

describe('validateDiscount', () => {
  it.each([0, 100])('allows discount %s inside the base price', (discount) => {
    expect(validateDiscount({ basePrice: 100, discount })).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it('rejects a discount above the base price', () => {
    expect(validateDiscount({ basePrice: 100, discount: 101 })).toMatchObject({
      allowed: false,
    });
  });

  it('rejects a negative discount', () => {
    expect(validateDiscount({ basePrice: 100, discount: -1 })).toMatchObject({
      allowed: false,
    });
  });
});

describe('computeQuoteTotal', () => {
  it('subtracts the fixed discount from the quoted base price', () => {
    expect(computeQuoteTotal({ quotedBasePrice: 1250, discount: 200 })).toBe(1050);
  });

  it('floors stale draft totals at zero when product pricing drops below the discount', () => {
    expect(computeQuoteTotal({ quotedBasePrice: 100, discount: 125 })).toBe(0);
  });
});
