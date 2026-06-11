import { describe, expect, it } from 'vitest';

import {
  PriorityQuote,
  QuoteCreateInput,
  QuoteDetail,
  QuoteProductBayAvailabilityInput,
  QuoteProductBayAvailabilityResult,
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

describe('QuoteDetail', () => {
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
        linkedJobs: [],
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
        selectedAssemblies: [],
        status: 'accepted',
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
      linkedJobs: [],
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
      selectedAssemblies: [],
      status: 'accepted',
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
