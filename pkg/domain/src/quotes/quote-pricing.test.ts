import type { OptionalAssembly } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { resolveEffectiveBom } from './effective-bom.js';
import {
  computeQuoteDiscountAmount,
  computeQuoteLineItemAmount,
  computeQuoteLineItemsTotal,
  computeQuoteTotal,
  computeQuoteTotalIncludingVat,
  computeQuoteVatAmount,
  priceQuote,
  priceQuoteFromLiveSelections,
  validateDiscount,
} from './quote-pricing.js';

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

  it('discounts line items with the base price and selected optional assemblies', () => {
    expect(
      computeQuoteDiscountAmount({
        discountPercent: 10,
        lineItems: [
          { quantity: 2, unitPrice: 125 },
          { quantity: 1, unitPrice: 50 },
        ],
        quotedBasePrice: 1250,
        selectedAssemblyPrices: [300, 150],
      }),
    ).toBe(200);
  });

  it('rounds the derived currency amount to cents', () => {
    expect(computeQuoteDiscountAmount({ discountPercent: 12.5, quotedBasePrice: 99.99 })).toBe(12.5);
  });
});

describe('computeQuoteLineItemsTotal', () => {
  it('computes one line amount from quantity times unit price', () => {
    expect(computeQuoteLineItemAmount({ quantity: 3, unitPrice: 125 })).toBe(375);
  });

  it('totals quantity times unit price for every line item', () => {
    expect(
      computeQuoteLineItemsTotal([
        { quantity: 2, unitPrice: 125 },
        { quantity: 3, unitPrice: 10 },
      ]),
    ).toBe(280);
  });
});

describe('quote document VAT helpers', () => {
  it('computes VAT from a quote document subtotal', () => {
    expect(computeQuoteVatAmount(2000)).toBe(300);
  });

  it('adds VAT to a quote document subtotal', () => {
    expect(computeQuoteTotalIncludingVat(2000)).toBe(2300);
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

  it('subtracts negative optional assembly snapshot prices from the product total', () => {
    expect(
      computeQuoteTotal({
        discountPercent: 0,
        quotedBasePrice: 1250,
        selectedAssemblyPrices: [-300],
      }),
    ).toBe(950);
  });

  it('does not let a negative discountable subtotal produce a negative discount', () => {
    expect(
      computeQuoteDiscountAmount({
        discountPercent: 10,
        quotedBasePrice: 100,
        selectedAssemblyPrices: [-150],
      }),
    ).toBe(0);
  });

  it('includes line items in the discountable subtotal', () => {
    expect(
      computeQuoteTotal({
        discountPercent: 10,
        lineItems: [
          { quantity: 2, unitPrice: 125 },
          { quantity: 1, unitPrice: 50 },
        ],
        quotedBasePrice: 1250,
        selectedAssemblyPrices: [300, 150],
      }),
    ).toBe(1800);
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

describe('priceQuoteFromLiveSelections', () => {
  it('builds the breakdown from facts and a live selection set', () => {
    const pricing = priceQuoteFromLiveSelections(
      {
        deliveryIncluded: true,
        deliveryPrice: 350,
        discountPercent: 10,
        lineItems: [{ quantity: 2, unitPrice: 125 }],
        quotedBasePrice: 1250,
      },
      [{ quotedPrice: 300 }, { quotedPrice: 150 }],
    );

    expect(pricing).toMatchObject({ discountAmount: 195, lineItemTotal: 250, selectedAssemblyTotal: 450, total: 2105 });
    expect(pricing.liveSelections).toHaveLength(2);
  });

  it('handles an empty selection set', () => {
    expect(priceQuoteFromLiveSelections({ discountPercent: 0, quotedBasePrice: 1000 }, [])).toMatchObject({
      discountAmount: 0,
      lineItemTotal: 0,
      selectedAssemblyTotal: 0,
      total: 1000,
    });
  });
});

describe('priceQuote', () => {
  it('excludes stale selections whose catalog reference is gone', () => {
    const pricing = priceQuote({
      discountPercent: 0,
      quotedBasePrice: 1000,
      lineItems: [{ quantity: 2, unitPrice: 125 }],
      selectedAssemblies: [
        { productAssemblyId: 'opt-live', quotedPrice: 300 },
        { productAssemblyId: null, quotedPrice: 999 },
      ],
    });

    expect(pricing.total).toBe(1550);
    expect(pricing.lineItemTotal).toBe(250);
    expect(pricing.selectedAssemblyTotal).toBe(300);
    expect(pricing.liveSelections).toHaveLength(1);
  });

  it('keeps delivery undiscounted under a full discount', () => {
    expect(
      priceQuote({
        deliveryIncluded: true,
        deliveryPrice: 50,
        discountPercent: 100,
        quotedBasePrice: 100,
        selectedAssemblies: [],
      }).total,
    ).toBe(50);
  });
});

describe('Quote Pricing agrees with the Effective Bill of Materials on the live set', () => {
  it('totals the same selections the document line items resolve from the catalog', () => {
    const liveSelection = { productAssemblyId: 'opt-live', quotedName: 'Heavy Axle', quotedPrice: 300 };
    const staleSelection = { productAssemblyId: null, quotedName: 'Removed Winch', quotedPrice: 999 };
    const quote = { discountPercent: 10, quotedBasePrice: 1250, selectedAssemblies: [liveSelection, staleSelection] };
    const catalog: OptionalAssembly[] = [
      {
        id: 'opt-live',
        kind: 'optional',
        name: 'Heavy Axle',
        overrideStandardAssemblyIds: [],
        parts: [],
        price: 300,
        productId: 'prod-1',
      },
    ];

    const pricing = priceQuote(quote);
    const effectiveBom = resolveEffectiveBom({
      catalogAssemblies: catalog,
      selectedAssemblies: quote.selectedAssemblies,
    });

    expect(pricing.liveSelections).toEqual([liveSelection]);
    expect(effectiveBom.selectedOptionalAssemblies.map(({ selection }) => selection)).toEqual([liveSelection]);
    expect(effectiveBom.staleSelections).toEqual([staleSelection]);
  });
});
