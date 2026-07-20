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
  offering: {
    kind: 'product' as const,
    productId: '550e8400-e29b-41d4-a716-446655440000',
  },
  salesPersonId: 'auth-user-1',
  status: 'draft' as const,
};

describe('QuoteCreateInput', () => {
  it('defaults discount and deposit percents to zero', () => {
    expect(QuoteCreateInput.parse(baseCreateInput)).toMatchObject({
      depositPercent: 0,
      discountPercent: 0,
      lineItems: [],
      offering: { kind: 'product', productId: '550e8400-e29b-41d4-a716-446655440000' },
    });
  });

  it('defaults inline customer contact fields to null and trims provided values', () => {
    expect(QuoteCreateInput.parse(baseCreateInput)).toMatchObject({
      customer: {
        type: 'inline',
        companyName: 'Acme Mining',
        contactPerson: null,
        email: null,
        phone: null,
        address: null,
      },
    });

    expect(
      QuoteCreateInput.parse({
        ...baseCreateInput,
        customer: {
          type: 'inline' as const,
          companyName: 'Acme Mining',
          contactPerson: '  Tony Jones  ',
          email: 'Tony@Acme.example',
          phone: '',
          address: null,
        },
      }),
    ).toMatchObject({
      customer: {
        type: 'inline',
        contactPerson: 'Tony Jones',
        email: 'tony@acme.example',
        phone: null,
        address: null,
      },
    });
  });

  it('parses a custom offering with a trimmed work title and entered base price', () => {
    expect(
      QuoteCreateInput.parse({
        ...baseCreateInput,
        offering: {
          kind: 'custom',
          workTitle: '  Hydraulic repair  ',
          basePrice: '2500.50',
        },
      }),
    ).toMatchObject({
      offering: { kind: 'custom', workTitle: 'Hydraulic repair', basePrice: 2500.5 },
    });
  });

  it('rejects a blank custom work title', () => {
    expect(() =>
      QuoteCreateInput.parse({
        ...baseCreateInput,
        offering: {
          kind: 'custom',
          workTitle: ' ',
          basePrice: 2500,
        },
      }),
    ).toThrow();
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

  it('rejects an additional delivery price when delivery is included', () => {
    expect(() => QuoteCreateInput.parse({ ...baseCreateInput, deliveryPrice: 350 })).toThrow(
      'Must be zero when delivery is included',
    );
  });

  it('requires a positive delivery price when delivery is not included', () => {
    expect(() => QuoteCreateInput.parse({ ...baseCreateInput, deliveryIncluded: false, deliveryPrice: 0 })).toThrow(
      'Must be greater than zero when delivery is not included',
    );
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
  it('parses a product offering update', () => {
    expect(QuoteUpdateInput.parse(baseUpdateInput())).toMatchObject({
      offering: { kind: 'product' },
    });
  });

  it('parses a custom offering update with a trimmed work title and entered base price', () => {
    expect(
      QuoteUpdateInput.parse({
        ...baseUpdateInput(),
        offering: {
          kind: 'custom',
          workTitle: '  Hydraulic repair  ',
          basePrice: '2500.50',
        },
      }),
    ).toMatchObject({
      offering: { kind: 'custom', workTitle: 'Hydraulic repair', basePrice: 2500.5 },
    });
  });

  it('rejects a blank custom work title', () => {
    expect(() =>
      QuoteUpdateInput.parse({
        ...baseUpdateInput(),
        offering: {
          kind: 'custom',
          workTitle: ' ',
          basePrice: 2500,
        },
      }),
    ).toThrow();
  });

  it('rejects an additional delivery price when delivery is included', () => {
    expect(() => QuoteUpdateInput.parse({ ...baseUpdateInput(), deliveryPrice: 350 })).toThrow(
      'Must be zero when delivery is included',
    );
  });

  it('requires a positive delivery price when delivery is not included', () => {
    expect(() => QuoteUpdateInput.parse({ ...baseUpdateInput(), deliveryIncluded: false, deliveryPrice: 0 })).toThrow(
      'Must be greater than zero when delivery is not included',
    );
  });

  it('preserves omitted child collections instead of defaulting them to empty replacements', () => {
    expect(QuoteUpdateInput.parse(baseUpdateInput())).not.toHaveProperty('lineItems');
    expect(QuoteUpdateInput.parse(baseUpdateInput())).not.toHaveProperty('selectedAssemblies');
    expect(QuoteUpdateInput.parse({ ...baseUpdateInput(), lineItems: [] })).toMatchObject({ lineItems: [] });
    expect(QuoteUpdateInput.parse({ ...baseUpdateInput(), selectedAssemblies: [] })).toMatchObject({
      selectedAssemblies: [],
    });
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
      kind: 'custom',
      notes: null,
      plannedDeliveryDate: null,
      preferredDeliveryDate: null,
      productId: null,
      product: null,
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
      workTitle: 'Hydraulic repair',
    };

    expect(QuoteSummary.parse(quoteSummary)).toMatchObject({
      productId: null,
      product: null,
    });
    expect(
      QuoteDetail.parse({
        ...quoteSummary,
        customerAddress: null,
        customerContactPerson: null,
        customerEmail: null,
        customerPhone: null,
        customerVatNumber: null,
      }),
    ).toMatchObject({
      product: null,
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
        kind: 'product',
        notes: null,
        plannedDeliveryDate: null,
        preferredDeliveryDate: null,
        productId: '550e8400-e29b-41d4-a716-446655440000',
        product: {
          assemblies: [],
          bays: [
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
          buildTimeDays: 14,
          currencyCode: 'ZAR',
          description: null,
          modelCode: 'WL-100',
          name: 'Wheel Loader',
          requiresVinNumber: false,
          thumbnailDataUrl: null,
        },
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
        workTitle: null,
      }).product?.bays,
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
    offering: { kind: 'product' as const },
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
      kind: 'product',
      notes: null,
      plannedDeliveryDate: '2026-08-01',
      preferredDeliveryDate: '2026-07-15',
      productId: '550e8400-e29b-41d4-a716-446655440000',
      product: {
        buildTimeDays: 14,
        currencyCode: 'ZAR',
        modelCode: 'WL-100',
        name: 'Wheel Loader',
        thumbnailDataUrl: null,
      },
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
      workTitle: null,
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
        jobDescription: 'Loader build',
        jobId: '550e8400-e29b-41d4-a716-446655440020',
      },
      kind: 'product',
      notes: null,
      plannedDeliveryDate: '2026-06-20',
      preferredDeliveryDate: null,
      productId: '550e8400-e29b-41d4-a716-446655440000',
      product: {
        buildTimeDays: 14,
        currencyCode: 'ZAR',
        modelCode: 'WL-100',
        name: 'Wheel Loader',
        thumbnailDataUrl: null,
      },
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
      workTitle: null,
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
