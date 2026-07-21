import { DEFAULT_CUSTOM_HOURLY_RATE } from '@pkg/domain';
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
  quoteWorkItemSummaryRows,
  shouldPinPriorityQuotes,
  toQuoteEditFormValues,
  toQuoteUpdateInput,
} from './quote-presentation';

const QUOTE_ID = '550e8400-e29b-41d4-a716-446655440000';
const CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440001';
const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440002';
const ASSEMBLY_ID = '550e8400-e29b-41d4-a716-446655440003';
const SELECTION_ID = '550e8400-e29b-41d4-a716-446655440004';
const WORK_ITEM_ID = '550e8400-e29b-41d4-a716-446655440006';
const WORK_ITEM_PART_ID = '550e8400-e29b-41d4-a716-446655440007';

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
      selectedAssemblies: [{ type: 'existing', id: SELECTION_ID }],
    });
  });

  it('round-trips custom work items with nested parts and seeds product edit state from the shared defaults', () => {
    const productQuote = buildQuoteDetail();
    expect(toQuoteEditFormValues(productQuote).hourlyRate).toBe(DEFAULT_CUSTOM_HOURLY_RATE);

    const customQuote = QuoteDetail.parse({
      ...productQuote,
      hourlyRate: 925,
      kind: 'custom',
      product: null,
      productId: null,
      selectedAssemblies: [],
      workItems: [
        {
          id: WORK_ITEM_ID,
          quoteId: QUOTE_ID,
          name: 'Rebuild pump',
          hours: 1.5,
          parts: [
            {
              id: WORK_ITEM_PART_ID,
              workItemId: WORK_ITEM_ID,
              name: 'Seal kit',
              quantity: 2,
              unitPrice: 125,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      workTitle: 'Hydraulic repair',
    });
    const values = toQuoteEditFormValues(customQuote);

    expect(values.hourlyRate).toBe(925);
    expect(values.workItems).toEqual([
      {
        name: 'Rebuild pump',
        hours: 1.5,
        parts: [{ name: 'Seal kit', quantity: 2, unitPrice: 125 }],
      },
    ]);
    expect(
      quoteWorkItemSummaryRows({ hourlyRate: values.hourlyRate, workItems: values.workItems }).map(
        ({ name, total }) => ({ name, total }),
      ),
    ).toEqual([{ name: 'Rebuild pump', total: 1637.5 }]);
    const input = toQuoteUpdateInput({ id: customQuote.id, kind: customQuote.kind, values });
    expect(input.offering).toEqual({
      basePrice: 1000,
      hourlyRate: 925,
      kind: 'custom',
      workItems: [
        {
          name: 'Rebuild pump',
          hours: 1.5,
          parts: [{ name: 'Seal kit', quantity: 2, unitPrice: 125 }],
        },
      ],
      workTitle: 'Hydraulic repair',
    });
  });

  it('validates custom work-item names, hours, part quantities, and prices at their nested fields', () => {
    const values = toQuoteEditFormValues(
      QuoteDetail.parse({
        ...buildQuoteDetail(),
        hourlyRate: 925,
        kind: 'custom',
        product: null,
        productId: null,
        selectedAssemblies: [],
        workItems: [],
        workTitle: 'Hydraulic repair',
      }),
    );
    const result = getQuoteEditFormValuesValidator('custom').safeParse({
      ...values,
      workItems: [
        {
          name: ' ',
          hours: -1,
          parts: [{ name: '', quantity: 0, unitPrice: -1 }],
        },
      ],
    });

    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['workItems', 0, 'hours'],
      ['workItems', 0, 'name'],
      ['workItems', 0, 'parts', 0, 'name'],
      ['workItems', 0, 'parts', 0, 'quantity'],
      ['workItems', 0, 'parts', 0, 'unitPrice'],
    ]);
  });
});
