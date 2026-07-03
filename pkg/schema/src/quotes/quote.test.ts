import { describe, expect, it } from 'vitest';

import {
  PriorityQuote,
  QuoteCreateInput,
  QuoteDetail,
  QuoteLineItemInput,
  QuoteProductBayAvailabilityInput,
  QuoteProductBayAvailabilityResult,
  QuoteSummary,
  QuoteUpdateInput,
  UpcomingDeliveryQuotesResult,
} from './quote.js';

const baseCreateInput = {
  customer: {
    type: 'inline' as const,
    companyName: 'Acme Mining',
  },
  notes: null,
  documentNotes: null,
  productId: '550e8400-e29b-41d4-a716-446655440000',
  salesPersonId: 'auth-user-1',
  status: 'draft' as const,
};

describe('QuoteCreateInput', () => {
  it('defaults discount and deposit percents to zero', () => {
    expect(QuoteCreateInput.parse(baseCreateInput)).toMatchObject({
      depositPercent: 0,
      discountPercent: 0,
      lineItems: [],
    });
  });

  it('rejects a negative deposit percent', () => {
    expect(() =>
      QuoteCreateInput.parse({
        ...baseCreateInput,
        depositPercent: -1,
      }),
    ).toThrow();
  });

  it('rejects a deposit percent above 100', () => {
    expect(() =>
      QuoteCreateInput.parse({
        ...baseCreateInput,
        depositPercent: 101,
      }),
    ).toThrow();
  });

  it('rejects a discount percent above 100', () => {
    expect(() =>
      QuoteCreateInput.parse({
        ...baseCreateInput,
        discountPercent: 101,
      }),
    ).toThrow();
  });
});

describe('QuoteLineItemInput', () => {
  it('trims names, coerces numbers, and defaults quantity to one', () => {
    expect(QuoteLineItemInput.parse({ name: '  Hydraulic hose  ', unitPrice: '125.50' })).toEqual({
      name: 'Hydraulic hose',
      quantity: 1,
      unitPrice: 125.5,
    });
  });

  it('rejects blank names, zero quantity, and negative unit prices', () => {
    expect(() => QuoteLineItemInput.parse({ name: ' ', quantity: 1, unitPrice: 10 })).toThrow();
    expect(() => QuoteLineItemInput.parse({ name: 'Hydraulic hose', quantity: 0, unitPrice: 10 })).toThrow();
    expect(() => QuoteLineItemInput.parse({ name: 'Hydraulic hose', quantity: 1, unitPrice: -1 })).toThrow();
  });
});

describe('QuoteUpdateInput', () => {
  it('preserves omitted line items instead of defaulting them to an empty replacement', () => {
    expect(QuoteUpdateInput.parse(baseUpdateInput())).not.toHaveProperty('lineItems');
    expect(QuoteUpdateInput.parse({ ...baseUpdateInput(), lineItems: [] })).toMatchObject({ lineItems: [] });
  });
});

describe('QuoteDetail', () => {
  it('parses quote read models without product-derived facts', () => {
    const quoteSummary = {
      code: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      customerCompanyName: 'Acme Mining',
      customerId: '550e8400-e29b-41d4-a716-446655440001',
      customerThumbnailDataUrl: null,
      deliveryIncluded: true,
      deliveryPrice: 0,
      depositPercent: 0,
      discountPercent: 0,
      documentNotes: null,
      id: '550e8400-e29b-41d4-a716-446655440010',
      job: null,
      notes: null,
      plannedDeliveryDate: null,
      preferredDeliveryDate: null,
      productBuildTimeDays: null,
      productCurrencyCode: null,
      productId: null,
      productModelCode: null,
      productName: null,
      quotedBasePrice: 1000,
      quotedCurrencyCode: 'ZAR',
      salesPersonEmail: null,
      salesPersonId: 'auth-user-1',
      salesPersonName: null,
      salesPersonThumbnailDataUrl: null,
      lineItems: [],
      selectedAssemblies: [],
      status: 'accepted',
      statusChangedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      validUntil: null,
    };

    expect(QuoteSummary.parse(quoteSummary)).toMatchObject({
      productBuildTimeDays: null,
      productId: null,
      productName: null,
    });
    expect(
      QuoteDetail.parse({
        ...quoteSummary,
        customerAddress: null,
        customerContactPerson: null,
        customerEmail: null,
        customerPhone: null,
        customerVatNumber: null,
        productAssemblies: [],
        productBays: [],
        productDescription: null,
        productRequiresVinNumber: null,
        productThumbnailDataUrl: null,
      }),
    ).toMatchObject({
      productAssemblies: [],
      productBays: [],
      productDescription: null,
      productRequiresVinNumber: null,
    });
  });

  it('parses Product Bays with embedded Bay state', () => {
    expect(
      QuoteDetail.parse({
        code: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        customerAddress: null,
        customerCompanyName: 'Acme Mining',
        customerContactPerson: null,
        customerEmail: null,
        customerId: '550e8400-e29b-41d4-a716-446655440001',
        customerPhone: null,
        customerThumbnailDataUrl: null,
        customerVatNumber: null,
        deliveryIncluded: true,
        deliveryPrice: 0,
        depositPercent: 0,
        discountPercent: 0,
        documentNotes: null,
        id: '550e8400-e29b-41d4-a716-446655440010',
        job: null,
        notes: null,
        plannedDeliveryDate: null,
        preferredDeliveryDate: null,
        productAssemblies: [],
        productBays: [
          {
            bay: {
              createdAt: '2026-01-01T00:00:00.000Z',
              department: 'fabrication',
              disabledAt: null,
              id: '550e8400-e29b-41d4-a716-446655440020',
              name: 'Fabrication Bay',
              scheduleOrigin: '2026-01-01',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            bayId: '550e8400-e29b-41d4-a716-446655440020',
            defaultWorkingDays: 4,
            productId: '550e8400-e29b-41d4-a716-446655440000',
          },
        ],
        productBuildTimeDays: 14,
        productCurrencyCode: 'ZAR',
        productDescription: null,
        productId: '550e8400-e29b-41d4-a716-446655440000',
        productModelCode: 'WL-100',
        productName: 'Wheel Loader',
        productRequiresVinNumber: false,
        productThumbnailDataUrl: null,
        quotedBasePrice: 1000,
        quotedCurrencyCode: 'ZAR',
        salesPersonEmail: null,
        salesPersonId: 'auth-user-1',
        salesPersonName: null,
        salesPersonThumbnailDataUrl: null,
        lineItems: [],
        selectedAssemblies: [],
        status: 'accepted',
        statusChangedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        validUntil: null,
      }).productBays,
    ).toEqual([
      expect.objectContaining({
        bay: expect.objectContaining({ disabledAt: null, name: 'Fabrication Bay' }),
        bayId: '550e8400-e29b-41d4-a716-446655440020',
        defaultWorkingDays: 4,
      }),
    ]);
  });
});

function baseUpdateInput() {
  return {
    id: '550e8400-e29b-41d4-a716-446655440010',
    salesPersonId: 'auth-user-1',
    status: 'draft' as const,
    discountPercent: 0,
    depositPercent: 0,
    deliveryIncluded: true,
    deliveryPrice: 0,
    validUntil: null,
    preferredDeliveryDate: null,
    plannedDeliveryDate: null,
    notes: null,
    documentNotes: null,
    selectedAssemblies: [],
  };
}

describe('QuoteProductBayAvailability', () => {
  it('parses the quote-scoped Product Bay availability contract', () => {
    expect(QuoteProductBayAvailabilityInput.parse({ quoteId: '550e8400-e29b-41d4-a716-446655440010' })).toEqual({
      quoteId: '550e8400-e29b-41d4-a716-446655440010',
    });
    expect(
      QuoteProductBayAvailabilityResult.parse({
        bays: [
          {
            bayId: '550e8400-e29b-41d4-a716-446655440020',
            defaultWorkingDays: 4,
            department: 'fabrication',
            name: 'Fabrication Bay',
            nextAvailableDate: '2026-06-10',
            waitWorkingDays: 3,
          },
        ],
        buildTimeDays: 14,
        defaultLeadTimeWorkingDays: 17,
        maxBayWaitWorkingDays: 3,
      }),
    ).toMatchObject({
      bays: [expect.objectContaining({ name: 'Fabrication Bay', waitWorkingDays: 3 })],
      defaultLeadTimeWorkingDays: 17,
    });
  });
});

describe('PriorityQuote', () => {
  it('parses the earliest delivery date alongside the quote summary', () => {
    const quoteSummary = {
      code: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      customerCompanyName: 'Acme Mining',
      customerId: '550e8400-e29b-41d4-a716-446655440001',
      customerThumbnailDataUrl: null,
      deliveryIncluded: true,
      deliveryPrice: 0,
      depositPercent: 0,
      discountPercent: 0,
      documentNotes: null,
      id: '550e8400-e29b-41d4-a716-446655440010',
      job: null,
      notes: null,
      plannedDeliveryDate: '2026-08-01',
      preferredDeliveryDate: '2026-07-15',
      productBuildTimeDays: 14,
      productCurrencyCode: 'ZAR',
      productId: '550e8400-e29b-41d4-a716-446655440000',
      productModelCode: 'WL-100',
      productName: 'Wheel Loader',
      quotedBasePrice: 1000,
      quotedCurrencyCode: 'ZAR',
      salesPersonEmail: null,
      salesPersonId: 'auth-user-1',
      salesPersonName: null,
      salesPersonThumbnailDataUrl: null,
      lineItems: [],
      selectedAssemblies: [],
      status: 'accepted',
      statusChangedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      validUntil: null,
    };

    expect(
      PriorityQuote.parse({
        ...quoteSummary,
        earliestDeliveryDate: '2026-07-15',
      }),
    ).toMatchObject({
      code: 'QUO-00001',
      earliestDeliveryDate: '2026-07-15',
    });
  });
});

describe('UpcomingDeliveryQuotesResult', () => {
  it('parses a non-null planned delivery date with server window dates', () => {
    const quoteSummary = {
      code: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      customerCompanyName: 'Acme Mining',
      customerId: '550e8400-e29b-41d4-a716-446655440001',
      customerThumbnailDataUrl: null,
      deliveryIncluded: true,
      deliveryPrice: 0,
      depositPercent: 0,
      discountPercent: 0,
      documentNotes: null,
      id: '550e8400-e29b-41d4-a716-446655440010',
      job: {
        jobCode: 7,
        jobId: '550e8400-e29b-41d4-a716-446655440020',
      },
      notes: null,
      plannedDeliveryDate: '2026-06-20',
      preferredDeliveryDate: null,
      productBuildTimeDays: 14,
      productCurrencyCode: 'ZAR',
      productId: '550e8400-e29b-41d4-a716-446655440000',
      productModelCode: 'WL-100',
      productName: 'Wheel Loader',
      quotedBasePrice: 1000,
      quotedCurrencyCode: 'ZAR',
      salesPersonEmail: null,
      salesPersonId: 'auth-user-1',
      salesPersonName: null,
      salesPersonThumbnailDataUrl: null,
      lineItems: [],
      selectedAssemblies: [],
      status: 'accepted',
      statusChangedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      validUntil: null,
    };

    expect(
      UpcomingDeliveryQuotesResult.parse({
        items: [quoteSummary],
        today: '2026-06-05',
        windowEndDate: '2026-07-05',
      }),
    ).toMatchObject({
      items: [
        {
          code: 'QUO-00001',
          job: {
            jobCode: 'JOB-00007',
          },
          plannedDeliveryDate: '2026-06-20',
        },
      ],
    });
  });
});
