import { QuoteDetail, type QuoteSummary } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  getNextQuotePage,
  getQuoteEditFormValuesValidator,
  isQuoteSort,
  isQuoteStatusFilter,
  presentQuotePages,
  quoteMetaLine,
  quoteSortDirection,
  shouldPinPriorityQuotes,
  toQuoteEditFormValues,
  toQuoteUpdateInput,
} from './quote-presentation';

const QUOTE_ID = '550e8400-e29b-41d4-a716-446655440000';
const CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440001';
const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440002';
const ASSEMBLY_ID = '550e8400-e29b-41d4-a716-446655440003';
const SELECTION_ID = '550e8400-e29b-41d4-a716-446655440004';
const LINE_ITEM_ID = '550e8400-e29b-41d4-a716-446655440005';

function buildQuoteDetail() {
  return QuoteDetail.parse({
    id: QUOTE_ID,
    code: 42,
    customerId: CUSTOMER_ID,
    kind: 'product',
    productId: PRODUCT_ID,
    workTitle: null,
    salesPersonId: 'auth-user-1',
    status: 'sent',
    statusChangedAt: '2026-01-01T00:00:00.000Z',
    depositPercent: 30,
    discountPercent: 10,
    deliveryIncluded: true,
    deliveryPrice: 0,
    validUntil: '2026-01-31',
    preferredDeliveryDate: '2026-02-01',
    plannedDeliveryDate: null,
    notes: 'Internal note',
    documentNotes: null,
    quotedBasePrice: 1000,
    quotedCurrencyCode: 'ZAR',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    customerAddress: '1 Mine Road',
    customerCompanyName: 'Acme',
    customerContactPerson: 'Ada Sales',
    customerEmail: 'buyer@example.com',
    customerPhone: '+27110000000',
    customerThumbnailDataUrl: null,
    customerVatNumber: 'VAT-123',
    job: null,
    product: {
      assemblies: [
        {
          id: ASSEMBLY_ID,
          productId: PRODUCT_ID,
          kind: 'optional',
          name: 'Optional A',
          price: 250,
          parts: [],
          overrideStandardAssemblyIds: [],
        },
      ],
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
    lineItems: [
      {
        id: LINE_ITEM_ID,
        quoteId: QUOTE_ID,
        name: 'Hydraulic hose',
        quantity: 2,
        unitPrice: 125,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    selectedAssemblies: [
      {
        id: SELECTION_ID,
        quoteId: QUOTE_ID,
        productAssemblyId: ASSEMBLY_ID,
        quotedName: 'Optional A',
        quotedPrice: 250,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
}

describe('Quote status presentation', () => {
  it('accepts only All and the five real statuses as persisted filters', () => {
    for (const value of ['all', 'draft', 'sent', 'accepted', 'rejected', 'cancelled']) {
      expect(isQuoteStatusFilter(value)).toBe(true);
    }

    expect(isQuoteStatusFilter('locked')).toBe(false);
    expect(isQuoteStatusFilter(null)).toBe(false);
  });
});

describe('Quote sort presentation', () => {
  it('accepts persisted sort values and maps them to server ordering', () => {
    expect(isQuoteSort('newest')).toBe(true);
    expect(isQuoteSort('oldest')).toBe(true);
    expect(isQuoteSort('createdAt')).toBe(false);
    expect(isQuoteSort(null)).toBe(false);
    expect(quoteSortDirection('newest')).toBe('desc');
    expect(quoteSortDirection('oldest')).toBe('asc');
  });
});

describe('quoteMetaLine', () => {
  it('describes Custom Quotes without Product facts', () => {
    expect(quoteMetaLine({ kind: 'custom' })).toBe('Custom work');
  });

  it('shows Product model, build time, and only live selected options', () => {
    expect(
      quoteMetaLine({
        kind: 'product',
        product: { buildTimeDays: 14, modelCode: 'FF 5000' },
        selectedAssemblies: [{ productAssemblyId: 'live' }, { productAssemblyId: null }],
      }),
    ).toBe('FF 5000 · 14 days · 1 option');
  });
});

describe('paged Quote presentation', () => {
  const quote = (id: string) => ({ id }) as QuoteSummary;

  it('pins priority Quotes only on the unfiltered, default-sorted list', () => {
    expect(shouldPinPriorityQuotes({ search: '', sort: 'newest', status: 'all' })).toBe(true);
    expect(shouldPinPriorityQuotes({ search: '  ', sort: 'newest', status: 'all' })).toBe(true);
    expect(shouldPinPriorityQuotes({ search: 'QUO-00001', sort: 'newest', status: 'all' })).toBe(false);
    expect(shouldPinPriorityQuotes({ search: '', sort: 'newest', status: 'accepted' })).toBe(false);
    expect(shouldPinPriorityQuotes({ search: '', sort: 'oldest', status: 'all' })).toBe(false);
  });

  it('keeps priority Quotes pinned and removes their duplicates from loaded pages', () => {
    const sections = presentQuotePages(
      [{ items: [quote('quote-1'), quote('quote-2')] }, { items: [quote('quote-3')] }],
      [quote('quote-2')],
    );

    expect(sections.priorityQuotes.map((item) => item.id)).toEqual(['quote-2']);
    expect(sections.mainQuotes.map((item) => item.id)).toEqual(['quote-1', 'quote-3']);
  });

  it('loads the next numbered page while fewer items than the server total are loaded', () => {
    expect(
      getNextQuotePage({ items: Array.from({ length: 20 }), total: 45 }, [{ items: Array.from({ length: 20 }) }]),
    ).toBe(2);

    expect(
      getNextQuotePage({ items: Array.from({ length: 5 }), total: 45 }, [
        { items: Array.from({ length: 20 }) },
        { items: Array.from({ length: 20 }) },
        { items: Array.from({ length: 5 }) },
      ]),
    ).toBeUndefined();
  });
});

describe('Quote edit presentation', () => {
  it('maps persisted details into a strict full-model update', () => {
    const quote = buildQuoteDetail();
    const values = {
      ...toQuoteEditFormValues(quote),
      deliveryIncluded: false,
      deliveryPrice: 450,
      plannedDeliveryDate: '2026-03-01',
    };

    const validation = getQuoteEditFormValuesValidator('product').safeParse(values);
    expect(validation.success, validation.error?.message).toBe(true);
    expect(toQuoteUpdateInput({ id: quote.id, kind: quote.kind, values })).toEqual({
      id: QUOTE_ID,
      offering: { kind: 'product' },
      salesPersonId: 'auth-user-1',
      status: 'sent',
      discountPercent: 10,
      depositPercent: 30,
      deliveryIncluded: false,
      deliveryPrice: 450,
      validUntil: '2026-01-31',
      preferredDeliveryDate: '2026-02-01',
      plannedDeliveryDate: '2026-03-01',
      notes: 'Internal note',
      documentNotes: null,
      lineItems: [{ name: 'Hydraulic hose', quantity: 2, unitPrice: 125 }],
      selectedAssemblies: [{ type: 'existing', id: SELECTION_ID }],
    });
  });
});
