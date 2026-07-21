import type { Assembly, OptionalAssembly } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  computeQuoteLineItemAmount,
  computeQuoteVatAmount,
  computeWorkItemLabourCost,
  computeWorkItemPartAmount,
  computeWorkItemTotal,
  priceQuote,
  priceQuoteWithCatalog,
  VAT_PERCENT,
  validateDiscount,
} from './quote-pricing.js';

function optionalAssembly(id: string, price: number): OptionalAssembly {
  return {
    id,
    kind: 'optional',
    name: `Assembly ${id}`,
    overrideStandardAssemblyIds: [],
    parts: [],
    price,
    productId: 'prod-1',
  };
}

function selections(prices: number[]) {
  return prices.map((quotedPrice, index) => ({ productAssemblyId: `opt-${index}`, quotedPrice }));
}

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

describe('computeQuoteLineItemAmount', () => {
  it('computes one line amount from quantity times unit price', () => {
    expect(computeQuoteLineItemAmount({ quantity: 3, unitPrice: 125 })).toBe(375);
  });
});

describe('work item pricing', () => {
  it('cent-rounds labour before adding parts', () => {
    expect(computeWorkItemLabourCost({ hourlyRate: 850.33, hours: 1.333 })).toBe(1133.49);
  });

  it('computes freeform part amounts from quantity and unit price', () => {
    expect(computeWorkItemPartAmount({ quantity: 3, unitPrice: 125.5 })).toBe(376.5);
  });

  it('supports labour-only, parts-only, and zero-cost work items', () => {
    expect(computeWorkItemTotal({ hourlyRate: 850, hours: 1.5, parts: [] })).toBe(1275);
    expect(computeWorkItemTotal({ hourlyRate: 850, hours: 0, parts: [{ quantity: 2, unitPrice: 125 }] })).toBe(250);
    expect(computeWorkItemTotal({ hourlyRate: 850, hours: 0, parts: [] })).toBe(0);
  });
});

describe('quote VAT', () => {
  it('computes VAT at the shared rate', () => {
    expect(VAT_PERCENT).toBe(15);
    expect(computeQuoteVatAmount(2000)).toBe(300);
  });
});

describe('priceQuote', () => {
  it('subtracts the discount percent from the quoted base price', () => {
    expect(priceQuote({ quotedBasePrice: 1250, discountPercent: 10, selectedAssemblies: [] })).toMatchObject({
      subtotal: 1125,
      total: 1293.75,
      vatAmount: 168.75,
    });
  });

  it('discounts the product plus selected optional assemblies', () => {
    expect(
      priceQuote({ discountPercent: 10, quotedBasePrice: 1250, selectedAssemblies: selections([300, 150]) }),
    ).toMatchObject({ discountAmount: 170, selectedAssemblyTotal: 450, subtotal: 1530, total: 1759.5 });
  });

  it('includes line items in the discountable subtotal', () => {
    expect(
      priceQuote({
        discountPercent: 10,
        lineItems: [
          { quantity: 2, unitPrice: 125 },
          { quantity: 1, unitPrice: 50 },
        ],
        quotedBasePrice: 1250,
        selectedAssemblies: selections([300, 150]),
      }),
    ).toMatchObject({ discountAmount: 200, lineItemTotal: 300, subtotal: 1800, total: 2070 });
  });

  it('includes work items in the discountable subtotal with base price, discount, and VAT', () => {
    const pricing = priceQuote({
      discountPercent: 10,
      hourlyRate: 850,
      quotedBasePrice: 1000,
      selectedAssemblies: [],
      workItems: [
        {
          hours: 1.33,
          parts: [{ quantity: 2, unitPrice: 125 }],
        },
      ],
    });

    expect(pricing).toMatchObject({
      discountAmount: 238.05,
      lineItemTotal: 0,
      subtotal: 2142.45,
      vatAmount: 321.37,
      workItemTotal: 1380.5,
    });
    expect(pricing.total).toBeCloseTo(2463.82);
  });

  it('rounds the derived discount amount to cents', () => {
    expect(priceQuote({ discountPercent: 12.5, quotedBasePrice: 99.99, selectedAssemblies: [] }).discountAmount).toBe(
      12.5,
    );
  });

  it('subtracts negative optional assembly snapshot prices from the product total', () => {
    expect(
      priceQuote({ discountPercent: 0, quotedBasePrice: 1250, selectedAssemblies: selections([-300]) }),
    ).toMatchObject({ subtotal: 950, total: 1092.5 });
  });

  it('does not let a negative discountable subtotal produce a negative discount', () => {
    expect(
      priceQuote({ discountPercent: 10, quotedBasePrice: 100, selectedAssemblies: selections([-150]) }).discountAmount,
    ).toBe(0);
  });

  it('does not add delivery price when delivery is included in the sale price', () => {
    expect(
      priceQuote({
        deliveryIncluded: true,
        deliveryPrice: 350,
        discountPercent: 10,
        quotedBasePrice: 1250,
        selectedAssemblies: [],
      }),
    ).toMatchObject({ subtotal: 1125, total: 1293.75 });
  });

  it('adds delivery price when delivery is not included in the sale price', () => {
    expect(
      priceQuote({
        deliveryIncluded: false,
        deliveryPrice: 350,
        discountPercent: 10,
        quotedBasePrice: 1250,
        selectedAssemblies: [],
      }),
    ).toMatchObject({ subtotal: 1475, total: 1696.25 });
  });

  it('keeps the additional delivery charge undiscounted when the commercial subtotal is fully discounted', () => {
    expect(
      priceQuote({
        deliveryIncluded: false,
        deliveryPrice: 50,
        discountPercent: 100,
        quotedBasePrice: 100,
        selectedAssemblies: [],
      }),
    ).toMatchObject({ subtotal: 50, total: 57.5 });
  });

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

    expect(pricing.subtotal).toBe(1550);
    expect(pricing.total).toBe(1782.5);
    expect(pricing.lineItemTotal).toBe(250);
    expect(pricing.selectedAssemblyTotal).toBe(300);
    expect(pricing.liveSelections).toHaveLength(1);
  });

  it('cent-rounds VAT so subtotal, VAT, and total reconcile exactly', () => {
    const pricing = priceQuote({ discountPercent: 0, quotedBasePrice: 100.03, selectedAssemblies: [] });

    expect(pricing.subtotal).toBe(100.03);
    expect(pricing.vatAmount).toBe(15);
    expect(pricing.total).toBe(115.03);
    expect(pricing.total).toBe(pricing.subtotal + pricing.vatAmount);
  });
});

describe('priceQuoteWithCatalog', () => {
  const catalog: Assembly[] = [optionalAssembly('opt-a', 300), optionalAssembly('opt-b', 150)];

  it('drops selections that do not resolve to a live Optional Assembly and returns them stale', () => {
    const live = { productAssemblyId: 'opt-a', quotedPrice: 300 };
    const unresolved = { productAssemblyId: 'opt-gone', quotedPrice: 500 };
    const nulled = { productAssemblyId: null, quotedPrice: 999 };
    const pricing = priceQuoteWithCatalog(
      { discountPercent: 0, quotedBasePrice: 1000, selectedAssemblies: [live, unresolved, nulled] },
      catalog,
    );

    expect(pricing.subtotal).toBe(1300);
    expect(pricing.total).toBe(1495);
    expect(pricing.liveSelections).toEqual([live]);
    expect(pricing.staleSelections).toEqual([unresolved, nulled]);
  });

  it('returns live selections in catalog display order, not selection order', () => {
    const selectionB = { productAssemblyId: 'opt-b', quotedPrice: 150 };
    const selectionA = { productAssemblyId: 'opt-a', quotedPrice: 300 };
    const pricing = priceQuoteWithCatalog(
      { discountPercent: 0, quotedBasePrice: 0, selectedAssemblies: [selectionB, selectionA] },
      catalog,
    );

    expect(pricing.liveSelections).toEqual([selectionA, selectionB]);
    expect(pricing.selectedAssemblyTotal).toBe(450);
  });

  it('prices line items and discounts identically to the persisted seam', () => {
    const pricing = priceQuoteWithCatalog(
      {
        deliveryIncluded: false,
        deliveryPrice: 350,
        discountPercent: 10,
        lineItems: [{ quantity: 2, unitPrice: 125 }],
        quotedBasePrice: 1250,
        selectedAssemblies: selections([300, 150]).map((selection, index) => ({
          ...selection,
          productAssemblyId: index === 0 ? 'opt-a' : 'opt-b',
        })),
      },
      catalog,
    );

    expect(pricing).toMatchObject({
      discountAmount: 195,
      lineItemTotal: 250,
      selectedAssemblyTotal: 450,
      subtotal: 2105,
      total: 2420.75,
    });
  });

  it('agrees with priceQuote on persisted selections, where staleness is exactly a null reference', () => {
    // Assembly kind is immutable and deletion nulls the reference, so a persisted selection is
    // either resolvable in the catalog or null. Both seams must produce one Quote Pricing for it.
    const quote = {
      deliveryIncluded: false,
      deliveryPrice: 120,
      discountPercent: 12.5,
      lineItems: [{ quantity: 3, unitPrice: 40 }],
      quotedBasePrice: 2000,
      selectedAssemblies: [
        { productAssemblyId: 'opt-b', quotedPrice: 150 },
        { productAssemblyId: null, quotedPrice: 999 },
        { productAssemblyId: 'opt-a', quotedPrice: 300 },
      ],
    };

    const persisted = priceQuote(quote);
    const withCatalog = priceQuoteWithCatalog(quote, catalog);

    expect(withCatalog.total).toBe(persisted.total);
    expect(withCatalog.discountAmount).toBe(persisted.discountAmount);
    expect(withCatalog.lineItemTotal).toBe(persisted.lineItemTotal);
    expect(withCatalog.selectedAssemblyTotal).toBe(persisted.selectedAssemblyTotal);
    expect(new Set(withCatalog.liveSelections)).toEqual(new Set(persisted.liveSelections));
    expect(withCatalog.staleSelections).toEqual([quote.selectedAssemblies[1]]);
  });
});
