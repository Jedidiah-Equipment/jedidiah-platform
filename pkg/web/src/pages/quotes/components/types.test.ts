import { type Assembly, QuoteDetail, type QuoteSelectedAssembly, QuoteUpdateInput } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  computeQuoteSummary,
  getDefaultQuoteDocumentLeadTime,
  getDefaultQuoteDocumentLeadTimeFromAvailability,
  getQuoteFormValuesValidator,
  QUOTE_CREATE_DEFAULT_VALUES,
  QuoteCreateFormValues,
  type QuoteFormValues,
  resolveQuoteDocumentLeadTime,
  resolveSelectedAssemblySnapshots,
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
const LINE_ITEM_ID = '550e8400-e29b-41d4-a716-446655440012';

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
    deliveryPrice: 50,
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
    deliveryPrice: 50,
    discountPercent: 10,
    basePrice: 1000,
    notes: 'Some notes',
    documentNotes: '30 days',
    lineItems: [],
    plannedDeliveryDate: '2026-03-01',
    preferredDeliveryDate: '2026-02-01',
    salesPersonId: 'auth-user-1',
    selectedAssemblies: [],
    status: 'sent',
    validUntil: '2026-01-01',
    workTitle: '',
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
    expect(values.workTitle).toBe('');
    expect(values.lineItems).toEqual([{ name: 'Hydraulic hose', quantity: 2, unitPrice: 125 }]);
    expect(values.selectedAssemblies).toEqual([{ type: 'existing', id: SELECTION_ID }]);
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

describe('getDefaultQuoteDocumentLeadTime', () => {
  it('defaults from the Product build time on the saved Quote detail', () => {
    const quote = buildQuoteDetail();

    expect(
      getDefaultQuoteDocumentLeadTime({
        ...quote,
        product: quote.product ? { ...quote.product, buildTimeDays: 21 } : null,
      }),
    ).toBe('21 working days');
  });

  it('leaves productless quote document lead time for the user to enter', () => {
    expect(getDefaultQuoteDocumentLeadTime(buildQuoteDetail({ product: null }))).toBe('');
  });

  it('defaults from Product build time plus the max bay wait when availability is loaded', () => {
    expect(getDefaultQuoteDocumentLeadTimeFromAvailability({ defaultLeadTimeWorkingDays: 34 })).toBe('34 working days');
  });

  it('does not overwrite a user-edited lead time when availability arrives late', () => {
    expect(
      resolveQuoteDocumentLeadTime({
        availability: { defaultLeadTimeWorkingDays: 34 },
        fallbackLeadTime: '21 working days',
        hasUserEditedLeadTime: true,
        leadTime: 'Call customer first',
      }),
    ).toBe('Call customer first');
    expect(
      resolveQuoteDocumentLeadTime({
        availability: { defaultLeadTimeWorkingDays: 34 },
        fallbackLeadTime: '21 working days',
        hasUserEditedLeadTime: false,
        leadTime: '21 working days',
      }),
    ).toBe('34 working days');
  });
});

describe('computeQuoteSummary', () => {
  const optionalAssembly: Assembly = {
    id: PRODUCT_ASSEMBLY_ID,
    productId: PRODUCT_ID,
    kind: 'optional',
    name: 'Optional A',
    price: 250,
    parts: [],
    overrideStandardAssemblyIds: [],
  } as Assembly;

  it('computes product quote pricing from live form values and catalog selections', () => {
    const productQuote = buildQuoteDetail();
    if (productQuote.product === null) {
      throw new Error('Expected product quote fixture to include product facts');
    }

    const quote = buildQuoteDetail({
      product: {
        ...productQuote.product,
        assemblies: [optionalAssembly],
      },
    });
    const summary = computeQuoteSummary({
      quote,
      values: buildFormValues({
        basePrice: 9999,
        deliveryIncluded: true,
        deliveryPrice: 50,
        discountPercent: 10,
        lineItems: [{ name: 'Install kit', quantity: 2, unitPrice: 100 }],
        selectedAssemblies: [{ type: 'catalog', productAssemblyId: PRODUCT_ASSEMBLY_ID }],
      }),
    });

    expect(summary.basePrice).toBe(1000);
    expect(summary.currencyCode).toBe('ZAR');
    expect(summary.lineItemTotal).toBe(200);
    expect(summary.selectedAssemblyTotal).toBe(250);
    expect(summary.discountAmount).toBe(145);
    expect(summary.total).toBe(1355);
    expect(summary.selectedAssemblies).toEqual([
      { id: PRODUCT_ASSEMBLY_ID, productAssemblyId: PRODUCT_ASSEMBLY_ID, quotedName: 'Optional A', quotedPrice: 250 },
    ]);
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
    expect(summary.total).toBe(1050);
  });

  it('uses entered base price and no assemblies for custom quotes', () => {
    const quote = buildQuoteDetail({ kind: 'custom', product: null, productId: null, workTitle: 'Hydraulic repair' });
    const summary = computeQuoteSummary({
      quote,
      values: buildFormValues({
        basePrice: 2500,
        deliveryIncluded: false,
        deliveryPrice: 500,
        discountPercent: 5,
        lineItems: [{ name: 'Travel', quantity: 2, unitPrice: 150 }],
        selectedAssemblies: [{ type: 'catalog', productAssemblyId: PRODUCT_ASSEMBLY_ID }],
      }),
    });

    expect(summary.basePrice).toBe(2500);
    expect(summary.deliveryPrice).toBe(0);
    expect(summary.lineItemTotal).toBe(300);
    expect(summary.selectedAssemblies).toEqual([]);
    expect(summary.total).toBe(2660);
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
    expect(input.lineItems).toEqual([]);
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
      buildCreateFormValues({ kind: 'custom', productId: '', workTitle: 'Hydraulic repair', basePrice: 2500 }),
    );

    expect(input.offering).toEqual({ kind: 'custom', workTitle: 'Hydraulic repair', basePrice: 2500 });
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
      value: buildFormValues({ lineItems: [{ name: 'Transport crate', quantity: 1, unitPrice: 300 }] }),
    });

    expect(input).toMatchObject({
      id: QUOTE_ID,
      depositPercent: 30,
      offering: { kind: 'product' },
      lineItems: [{ name: 'Transport crate', quantity: 1, unitPrice: 300 }],
      salesPersonId: 'auth-user-1',
      status: 'sent',
      discountPercent: 10,
    });
    expect(input).not.toHaveProperty('customer');
    expect(input).not.toHaveProperty('customerId');
    expect(input).not.toHaveProperty('productId');
  });

  it('coalesces empty edit dates to null and gates delivery price', () => {
    const input = toQuoteUpdateInput({
      id: QUOTE_ID,
      kind: 'product',
      value: buildFormValues({
        deliveryIncluded: false,
        deliveryPrice: 99,
        plannedDeliveryDate: '',
        preferredDeliveryDate: '',
        validUntil: '',
      }),
    });

    expect(input.deliveryIncluded).toBe(false);
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
      value: buildFormValues({ basePrice: 2500, workTitle: 'Hydraulic repair' }),
    });

    expect(input.offering).toEqual({ kind: 'custom', basePrice: 2500, workTitle: 'Hydraulic repair' });
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

describe('resolveSelectedAssemblySnapshots', () => {
  const optionalAssembly: Assembly = {
    id: PRODUCT_ASSEMBLY_ID,
    productId: PRODUCT_ID,
    kind: 'optional',
    name: 'Optional A',
    price: 250,
    parts: [],
    overrideStandardAssemblyIds: [],
  } as Assembly;

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
