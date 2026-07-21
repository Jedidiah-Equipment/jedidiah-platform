import { type Assembly, QuoteDetail, type QuoteSelectedAssembly } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { computeQuoteSummary, type QuoteSummaryFormValues, resolveSelectedAssemblySnapshots } from './quote-summary.js';

const QUOTE_ID = '550e8400-e29b-41d4-a716-446655440000';
const CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440001';
const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440002';
const SELECTION_ID = '550e8400-e29b-41d4-a716-446655440010';
const PRODUCT_ASSEMBLY_ID = '550e8400-e29b-41d4-a716-446655440011';

const optionalAssembly: Assembly = {
  id: PRODUCT_ASSEMBLY_ID,
  productId: PRODUCT_ID,
  kind: 'optional',
  name: 'Optional A',
  price: 250,
  parts: [],
  overrideStandardAssemblyIds: [],
} as Assembly;

function buildQuoteDetail(overrides: Record<string, unknown> = {}): QuoteDetail {
  return QuoteDetail.parse({
    id: QUOTE_ID,
    code: 1,
    customerId: CUSTOMER_ID,
    kind: 'product',
    productId: PRODUCT_ID,
    salesPersonId: 'auth-user-1',
    status: 'sent',
    statusChangedAt: '2026-01-01T00:00:00.000Z',
    depositPercent: 30,
    discountPercent: 10,
    deliveryIncluded: true,
    deliveryPrice: 0,
    validUntil: '2026-01-01',
    preferredDeliveryDate: '2026-02-01',
    plannedDeliveryDate: '2026-03-01',
    notes: 'Some notes',
    documentNotes: '30 days',
    quotedBasePrice: 1000,
    quotedCurrencyCode: 'ZAR',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workTitle: null,
    customerAddress: '1 Mine Road',
    customerCompanyName: 'Acme',
    customerContactPerson: 'Ada Sales',
    customerEmail: 'buyer@example.com',
    customerPhone: '+27110000000',
    customerThumbnailDataUrl: null,
    customerVatNumber: 'VAT-123',
    job: null,
    product: {
      assemblies: [],
      bays: [],
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      description: 'Useful widget',
      modelCode: 'MOD-1',
      name: 'Widget',
      requiresVinNumber: false,
      thumbnailDataUrl: null,
    },
    salesPersonEmail: 'sales@example.com',
    salesPersonName: 'Sales Person',
    salesPersonThumbnailDataUrl: null,
    selectedAssemblies: [
      {
        id: SELECTION_ID,
        quoteId: QUOTE_ID,
        productAssemblyId: PRODUCT_ASSEMBLY_ID,
        quotedName: 'Optional A',
        quotedPrice: 250,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    ...overrides,
  });
}

function buildFormValues(overrides: Partial<QuoteSummaryFormValues> = {}): QuoteSummaryFormValues {
  return {
    basePrice: 1000,
    deliveryIncluded: true,
    deliveryPrice: 0,
    discountPercent: 10,
    hourlyRate: 850,
    selectedAssemblies: [],
    workItems: [],
    ...overrides,
  };
}

function buildProductQuote(assemblies: Assembly[]): QuoteDetail {
  const productQuote = buildQuoteDetail();
  if (productQuote.product === null) {
    throw new Error('Expected product quote fixture to include product facts');
  }

  return buildQuoteDetail({ product: { ...productQuote.product, assemblies } });
}

describe('computeQuoteSummary', () => {
  it('computes product quote pricing from live form values and catalog selections', () => {
    const summary = computeQuoteSummary({
      quote: buildProductQuote([optionalAssembly]),
      values: buildFormValues({
        basePrice: 9999,
        deliveryIncluded: true,
        deliveryPrice: 50,
        discountPercent: 10,
        selectedAssemblies: [{ type: 'catalog', productAssemblyId: PRODUCT_ASSEMBLY_ID }],
      }),
    });

    expect(summary.basePrice).toBe(1000);
    expect(summary.currencyCode).toBe('ZAR');
    expect(summary.selectedAssemblyTotal).toBe(250);
    expect(summary.discountAmount).toBe(125);
    expect(summary.subtotal).toBe(1125);
    expect(summary.vatAmount).toBe(168.75);
    expect(summary.vatPercent).toBe(15);
    expect(summary.total).toBe(1293.75);
    expect(summary.selectedAssemblies).toEqual([
      { id: PRODUCT_ASSEMBLY_ID, productAssemblyId: PRODUCT_ASSEMBLY_ID, quotedName: 'Optional A', quotedPrice: 250 },
    ]);
  });

  it('keeps selected assembly credits in the pricing summary', () => {
    const creditAssembly = { ...optionalAssembly, name: 'Manual controls credit', price: -250 };
    const summary = computeQuoteSummary({
      quote: buildProductQuote([creditAssembly]),
      values: buildFormValues({
        discountPercent: 0,
        selectedAssemblies: [{ type: 'catalog', productAssemblyId: PRODUCT_ASSEMBLY_ID }],
      }),
    });

    expect(summary.selectedAssemblyTotal).toBe(-250);
    expect(summary.subtotal).toBe(750);
    expect(summary.total).toBe(862.5);
    expect(summary.selectedAssemblies).toEqual([
      {
        id: PRODUCT_ASSEMBLY_ID,
        productAssemblyId: PRODUCT_ASSEMBLY_ID,
        quotedName: 'Manual controls credit',
        quotedPrice: -250,
      },
    ]);
  });

  it('lists live selections in catalog display order, matching the Quote Document', () => {
    const SECOND_ASSEMBLY_ID = '550e8400-e29b-41d4-a716-446655440013';
    const laterAssembly = { ...optionalAssembly, id: SECOND_ASSEMBLY_ID, name: 'Optional B', price: 100 };
    const summary = computeQuoteSummary({
      quote: buildProductQuote([optionalAssembly, laterAssembly]),
      values: buildFormValues({
        discountPercent: 0,
        selectedAssemblies: [
          { type: 'catalog', productAssemblyId: SECOND_ASSEMBLY_ID },
          { type: 'catalog', productAssemblyId: PRODUCT_ASSEMBLY_ID },
        ],
      }),
    });

    expect(summary.selectedAssemblies.map((selection) => selection.quotedName)).toEqual(['Optional A', 'Optional B']);
    expect(summary.selectedAssemblyTotal).toBe(350);
  });

  it('excludes stale catalog selections from product quote pricing', () => {
    const summary = computeQuoteSummary({
      quote: buildQuoteDetail(),
      values: buildFormValues({
        discountPercent: 0,
        selectedAssemblies: [{ type: 'catalog', productAssemblyId: PRODUCT_ASSEMBLY_ID }],
      }),
    });

    expect(summary.selectedAssemblies).toEqual([]);
    expect(summary.selectedAssemblyTotal).toBe(0);
    expect(summary.subtotal).toBe(1000);
    expect(summary.total).toBe(1150);
  });

  it('uses entered base price and no assemblies for custom quotes', () => {
    const quote = buildQuoteDetail({
      hourlyRate: 850,
      kind: 'custom',
      product: null,
      productId: null,
      workItems: [],
      workTitle: 'Hydraulic repair',
    });
    const summary = computeQuoteSummary({
      quote,
      values: buildFormValues({
        basePrice: 2500,
        deliveryIncluded: false,
        deliveryPrice: 500,
        discountPercent: 5,
        hourlyRate: 900,
        selectedAssemblies: [{ type: 'catalog', productAssemblyId: PRODUCT_ASSEMBLY_ID }],
        workItems: [
          {
            name: 'Travel',
            hours: 1,
            parts: [{ name: 'Fuel', quantity: 2, unitPrice: 150 }],
          },
        ],
      }),
    });

    expect(summary.basePrice).toBe(2500);
    expect(summary.deliveryPrice).toBe(500);
    expect(summary.hourlyRate).toBe(900);
    expect(summary.workItemTotal).toBe(1200);
    expect(summary.workItems).toHaveLength(1);
    expect(summary.selectedAssemblies).toEqual([]);
    expect(summary.subtotal).toBe(4015);
    expect(summary.total).toBe(4617.25);
  });
});

describe('resolveSelectedAssemblySnapshots', () => {
  const initialSelection = {
    id: SELECTION_ID,
    quoteId: QUOTE_ID,
    productAssemblyId: PRODUCT_ASSEMBLY_ID,
    quotedName: 'Optional A',
    quotedPrice: 250,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as QuoteSelectedAssembly;

  it('resolves an existing selection from the quote snapshot', () => {
    const snapshots = resolveSelectedAssemblySnapshots({
      catalogAssemblies: [],
      formSelections: [{ type: 'existing', id: initialSelection.id }],
      initialSelections: [initialSelection],
    });

    expect(snapshots).toEqual([initialSelection]);
  });

  it('resolves a catalog selection from the product assemblies', () => {
    const snapshots = resolveSelectedAssemblySnapshots({
      catalogAssemblies: [optionalAssembly],
      formSelections: [{ type: 'catalog', productAssemblyId: PRODUCT_ASSEMBLY_ID }],
      initialSelections: [],
    });

    expect(snapshots).toEqual([
      { id: PRODUCT_ASSEMBLY_ID, productAssemblyId: PRODUCT_ASSEMBLY_ID, quotedName: 'Optional A', quotedPrice: 250 },
    ]);
  });

  it('drops selections that no longer resolve', () => {
    const snapshots = resolveSelectedAssemblySnapshots({
      catalogAssemblies: [],
      formSelections: [{ type: 'catalog', productAssemblyId: PRODUCT_ASSEMBLY_ID }],
      initialSelections: [],
    });

    expect(snapshots).toEqual([]);
  });
});
