import { DEFAULT_CUSTOM_HOURLY_RATE } from '@pkg/domain';
import { QuoteDetail, QuoteUpdateInput } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  getQuoteFormValuesValidator,
  QUOTE_CREATE_DEFAULT_VALUES,
  QuoteCreateFormValues,
  type QuoteFormValues,
  toQuoteCreateInput,
  toQuoteFormValues,
  toQuoteUpdateInput,
} from './types.js';

const QUOTE_ID = '550e8400-e29b-41d4-a716-446655440000';
const CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440001';
const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440002';
const BAY_ID = '550e8400-e29b-41d4-a716-446655440003';
const RANGE_ID = '550e8400-e29b-41d4-a716-446655440004';
const SELECTION_ID = '550e8400-e29b-41d4-a716-446655440010';
const PRODUCT_ASSEMBLY_ID = '550e8400-e29b-41d4-a716-446655440011';
const WORK_ITEM_ID = '550e8400-e29b-41d4-a716-446655440013';
const WORK_ITEM_PART_ID = '550e8400-e29b-41d4-a716-446655440014';

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
      bays: [
        {
          bay: {
            createdAt: '2026-01-01T00:00:00.000Z',
            department: 'fabrication',
            disabledAt: null,
            id: BAY_ID,
            name: 'Fabrication Bay',
            scheduleOrigin: '2026-01-01',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          bayId: BAY_ID,
          defaultWorkingDays: 5,
          productId: PRODUCT_ID,
        },
      ],
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

function buildCreateFormValues(overrides: Partial<QuoteCreateFormValues> = {}): QuoteCreateFormValues {
  return {
    customerId: CUSTOMER_ID,
    customerMode: 'existing',
    basePrice: 0,
    hourlyRate: DEFAULT_CUSTOM_HOURLY_RATE,
    inlineCompanyName: '',
    kind: 'product',
    productId: PRODUCT_ID,
    rangeId: '',
    salesPersonId: 'auth-user-1',
    status: 'sent',
    workTitle: '',
    ...overrides,
  };
}

function buildFormValues(overrides: Partial<QuoteFormValues> = {}): QuoteFormValues {
  return {
    depositPercent: 30,
    deliveryIncluded: true,
    deliveryPrice: 0,
    discountPercent: 10,
    basePrice: 1000,
    hourlyRate: DEFAULT_CUSTOM_HOURLY_RATE,
    notes: 'Some notes',
    documentNotes: '30 days',
    plannedDeliveryDate: '2026-03-01',
    preferredDeliveryDate: '2026-02-01',
    salesPersonId: 'auth-user-1',
    selectedAssemblies: [],
    status: 'sent',
    validUntil: '2026-01-01',
    workTitle: '',
    workItems: [],
    ...overrides,
  };
}

describe('toQuoteFormValues', () => {
  it('maps an existing quote into form state', () => {
    const values = toQuoteFormValues(buildQuoteDetail());

    expect(values.notes).toBe('Some notes');
    expect(values.documentNotes).toBe('30 days');
    expect(values.depositPercent).toBe(30);
    expect(values.validUntil).toBe('2026-01-01');
    expect(values.status).toBe('sent');
    expect(values.basePrice).toBe(1000);
    expect(values.hourlyRate).toBe(DEFAULT_CUSTOM_HOURLY_RATE);
    expect(values.workTitle).toBe('');
    expect(values.selectedAssemblies).toEqual([{ type: 'existing', id: SELECTION_ID }]);
  });

  it('maps custom quote commercial facts and nested work items into form state', () => {
    const values = toQuoteFormValues(
      buildQuoteDetail({
        hourlyRate: 925,
        kind: 'custom',
        product: null,
        productId: null,
        workItems: [
          {
            id: WORK_ITEM_ID,
            quoteId: QUOTE_ID,
            name: 'Strip pump',
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
      }),
    );

    expect(values.hourlyRate).toBe(925);
    expect(values.workItems).toEqual([
      {
        hours: 1.5,
        name: 'Strip pump',
        parts: [{ name: 'Seal kit', quantity: 2, unitPrice: 125 }],
      },
    ]);
  });

  it('collapses nullable schema fields to empty strings', () => {
    const values = toQuoteFormValues(
      buildQuoteDetail({
        notes: null,
        documentNotes: null,
        validUntil: null,
        preferredDeliveryDate: null,
        plannedDeliveryDate: null,
        workTitle: null,
      }),
    );

    expect(values.notes).toBe('');
    expect(values.documentNotes).toBe('');
    expect(values.validUntil).toBe('');
    expect(values.preferredDeliveryDate).toBe('');
    expect(values.plannedDeliveryDate).toBe('');
  });
});

describe('QuoteCreateFormValues', () => {
  it('contains only the modal fields needed to create a quote shell', () => {
    expect(QUOTE_CREATE_DEFAULT_VALUES).toEqual({
      customerId: '',
      customerMode: 'existing',
      basePrice: 0,
      hourlyRate: DEFAULT_CUSTOM_HOURLY_RATE,
      inlineCompanyName: '',
      kind: 'product',
      productId: '',
      rangeId: '',
      salesPersonId: '',
      status: 'draft',
      workTitle: '',
    });
  });

  it('validates either an existing customer or an inline company name', () => {
    expect(QuoteCreateFormValues.safeParse(buildCreateFormValues()).success).toBe(true);
    expect(
      QuoteCreateFormValues.safeParse(
        buildCreateFormValues({ customerMode: 'inline', customerId: '', inlineCompanyName: 'New Co' }),
      ).success,
    ).toBe(true);
    expect(QuoteCreateFormValues.safeParse(buildCreateFormValues({ customerId: '' })).success).toBe(false);
    expect(
      QuoteCreateFormValues.safeParse(
        buildCreateFormValues({ customerMode: 'inline', customerId: '', inlineCompanyName: '' }),
      ).success,
    ).toBe(false);
  });

  it('validates product and custom offering fields by kind', () => {
    expect(QuoteCreateFormValues.safeParse(buildCreateFormValues({ productId: '' })).success).toBe(false);
    expect(QuoteCreateFormValues.safeParse(buildCreateFormValues({ basePrice: Number.NaN })).success).toBe(true);
    expect(
      QuoteCreateFormValues.safeParse(
        buildCreateFormValues({ kind: 'custom', productId: '', workTitle: 'Hydraulic repair', basePrice: 2500 }),
      ).success,
    ).toBe(true);
    expect(
      QuoteCreateFormValues.safeParse(buildCreateFormValues({ kind: 'custom', productId: '', workTitle: '' })).success,
    ).toBe(false);
    expect(
      QuoteCreateFormValues.safeParse(
        buildCreateFormValues({ kind: 'custom', productId: '', workTitle: 'Hydraulic repair', basePrice: Number.NaN }),
      ).success,
    ).toBe(false);
  });
});

describe('toQuoteCreateInput', () => {
  it('builds the existing-customer union and lets schema defaults fill edit-only fields', () => {
    const input = toQuoteCreateInput(buildCreateFormValues());

    expect(input.customer).toEqual({ type: 'existing', customerId: CUSTOMER_ID });
    expect(input.discountPercent).toBe(0);
    expect(input.depositPercent).toBe(0);
    expect(input.deliveryIncluded).toBe(true);
    expect(input.deliveryPrice).toBe(0);
    expect(input.validUntil).toBeNull();
    expect(input.preferredDeliveryDate).toBeNull();
    expect(input.plannedDeliveryDate).toBeNull();
    expect(input.notes).toBeNull();
    expect(input.documentNotes).toBeNull();
    expect(input.offering).toEqual({ kind: 'product', productId: PRODUCT_ID });
    expect(input.selectedAssemblies).toEqual([]);
  });

  it('builds the inline-customer union from the company name', () => {
    const input = toQuoteCreateInput(
      buildCreateFormValues({ customerMode: 'inline', customerId: '', inlineCompanyName: 'New Co' }),
    );

    expect(input.customer).toEqual({
      type: 'inline',
      companyName: 'New Co',
      contactPerson: null,
      email: null,
      phone: null,
      address: null,
    });
  });

  it('preserves cancelled status in create submissions', () => {
    const input = toQuoteCreateInput(buildCreateFormValues({ status: 'cancelled' }));

    expect(input.status).toBe('cancelled');
  });

  it('builds the custom offering from work title and base price', () => {
    const input = toQuoteCreateInput(
      buildCreateFormValues({
        kind: 'custom',
        productId: '',
        workTitle: 'Hydraulic repair',
        basePrice: 2500,
        hourlyRate: 925,
      }),
    );

    expect(input.offering).toEqual({
      kind: 'custom',
      workTitle: 'Hydraulic repair',
      basePrice: 2500,
      hourlyRate: 925,
      workItems: [],
    });
  });

  it('ignores the create-dialog Range filter in create submissions', () => {
    const input = toQuoteCreateInput(buildCreateFormValues({ rangeId: RANGE_ID }));

    expect(input.offering).toEqual({ kind: 'product', productId: PRODUCT_ID });
    expect(input).not.toHaveProperty('rangeId');
  });
});

describe('toQuoteUpdateInput', () => {
  it('omits customer and product identity from edit submissions', () => {
    const input = toQuoteUpdateInput({
      id: QUOTE_ID,
      kind: 'product',
      value: buildFormValues(),
    });

    expect(input).toMatchObject({
      id: QUOTE_ID,
      depositPercent: 30,
      offering: { kind: 'product' },
      salesPersonId: 'auth-user-1',
      status: 'sent',
      discountPercent: 10,
    });
    expect(input).not.toHaveProperty('customer');
    expect(input).not.toHaveProperty('customerId');
    expect(input).not.toHaveProperty('productId');
  });

  it('coalesces empty edit dates to null and clears delivery price when it is included in the sale price', () => {
    const input = toQuoteUpdateInput({
      id: QUOTE_ID,
      kind: 'product',
      value: buildFormValues({
        deliveryIncluded: true,
        deliveryPrice: 99,
        plannedDeliveryDate: '',
        preferredDeliveryDate: '',
        validUntil: '',
      }),
    });

    expect(input.deliveryIncluded).toBe(true);
    expect(input.deliveryPrice).toBe(0);
    expect(input.plannedDeliveryDate).toBeNull();
    expect(input.preferredDeliveryDate).toBeNull();
    expect(input.validUntil).toBeNull();
  });

  it('preserves cancelled status in edit submissions', () => {
    const input = toQuoteUpdateInput({
      id: QUOTE_ID,
      kind: 'product',
      value: buildFormValues({ status: 'cancelled' }),
    });

    expect(input.status).toBe('cancelled');
  });

  it('emits custom quote offering facts without conflating blank work titles with omission', () => {
    const input = toQuoteUpdateInput({
      id: QUOTE_ID,
      kind: 'custom',
      value: buildFormValues({
        basePrice: 2500,
        hourlyRate: 975,
        workTitle: 'Hydraulic repair',
        workItems: [{ name: 'Strip pump', hours: 1.5, parts: [] }],
      }),
    });

    expect(input.offering).toEqual({
      kind: 'custom',
      basePrice: 2500,
      hourlyRate: 975,
      workTitle: 'Hydraulic repair',
      workItems: [{ name: 'Strip pump', hours: 1.5, parts: [] }],
    });
    expect(() =>
      toQuoteUpdateInput({
        id: QUOTE_ID,
        kind: 'custom',
        value: buildFormValues({ basePrice: 2500, workTitle: '' }),
      }),
    ).toThrow();
  });

  it('validates custom work titles at the form boundary only when kind is custom', () => {
    expect(getQuoteFormValuesValidator('product').safeParse(buildFormValues({ workTitle: '' })).success).toBe(true);
    expect(getQuoteFormValuesValidator('custom').safeParse(buildFormValues({ workTitle: '' })).success).toBe(false);
    expect(
      getQuoteFormValuesValidator('custom').safeParse(buildFormValues({ workTitle: 'Hydraulic repair' })).success,
    ).toBe(true);
  });

  it('requires a positive price when delivery is not included', () => {
    const result = getQuoteFormValuesValidator('product').safeParse(
      buildFormValues({ deliveryIncluded: false, deliveryPrice: 0 }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        message: 'Must be greater than zero when delivery is not included',
        path: ['deliveryPrice'],
      }),
    );
  });

  it('rejects customer and product keys at the schema boundary', () => {
    expect(() =>
      QuoteUpdateInput.parse({
        ...toQuoteUpdateInput({ id: QUOTE_ID, kind: 'product', value: buildFormValues() }),
        customer: { type: 'existing', customerId: CUSTOMER_ID },
      }),
    ).toThrow();
    expect(() =>
      QuoteUpdateInput.parse({
        ...toQuoteUpdateInput({ id: QUOTE_ID, kind: 'product', value: buildFormValues() }),
        productId: PRODUCT_ID,
      }),
    ).toThrow();
  });
});
