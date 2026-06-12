import { type Assembly, QuoteDetail, type QuoteSelectedAssembly, QuoteUpdateInput } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  getDefaultQuoteDocumentLeadTime,
  getDefaultQuoteDocumentLeadTimeFromAvailability,
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
const SELECTION_ID = '550e8400-e29b-41d4-a716-446655440010';
const PRODUCT_ASSEMBLY_ID = '550e8400-e29b-41d4-a716-446655440011';

function buildQuoteDetail(overrides: Record<string, unknown> = {}): QuoteDetail {
  return QuoteDetail.parse({
    id: QUOTE_ID,
    code: 1,
    customerId: CUSTOMER_ID,
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
    customerAddress: '1 Mine Road',
    customerCompanyName: 'Acme',
    customerContactPerson: 'Ada Sales',
    customerEmail: 'buyer@example.com',
    customerPhone: '+27110000000',
    customerThumbnailDataUrl: null,
    customerVatNumber: 'VAT-123',
    job: null,
    productCurrencyCode: 'ZAR',
    productBuildTimeDays: 14,
    productDescription: 'Useful widget',
    productModelCode: 'MOD-1',
    productName: 'Widget',
    productRequiresVinNumber: false,
    productThumbnailDataUrl: null,
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
    productAssemblies: [],
    productBays: [
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
    ...overrides,
  });
}

function buildCreateFormValues(overrides: Partial<QuoteCreateFormValues> = {}): QuoteCreateFormValues {
  return {
    customerId: CUSTOMER_ID,
    customerMode: 'existing',
    inlineCompanyName: '',
    productId: PRODUCT_ID,
    salesPersonId: 'auth-user-1',
    status: 'sent',
    ...overrides,
  };
}

function buildFormValues(overrides: Partial<QuoteFormValues> = {}): QuoteFormValues {
  return {
    depositPercent: 30,
    deliveryIncluded: true,
    deliveryPrice: 50,
    discountPercent: 10,
    notes: 'Some notes',
    documentNotes: '30 days',
    plannedDeliveryDate: '2026-03-01',
    preferredDeliveryDate: '2026-02-01',
    salesPersonId: 'auth-user-1',
    selectedAssemblies: [],
    status: 'sent',
    validUntil: '2026-01-01',
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
      inlineCompanyName: '',
      productId: '',
      salesPersonId: '',
      status: 'draft',
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
});

describe('getDefaultQuoteDocumentLeadTime', () => {
  it('defaults from the Product build time on the saved Quote detail', () => {
    expect(getDefaultQuoteDocumentLeadTime(buildQuoteDetail({ productBuildTimeDays: 21 }))).toBe('21 working days');
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
    expect(input.selectedAssemblies).toEqual([]);
  });

  it('builds the inline-customer union from the company name', () => {
    const input = toQuoteCreateInput(
      buildCreateFormValues({ customerMode: 'inline', customerId: '', inlineCompanyName: 'New Co' }),
    );

    expect(input.customer).toEqual({ type: 'inline', companyName: 'New Co' });
  });

  it('preserves cancelled status in create submissions', () => {
    const input = toQuoteCreateInput(buildCreateFormValues({ status: 'cancelled' }));

    expect(input.status).toBe('cancelled');
  });
});

describe('toQuoteUpdateInput', () => {
  it('omits customer and product identity from edit submissions', () => {
    const input = toQuoteUpdateInput({ id: QUOTE_ID, value: buildFormValues() });

    expect(input).toMatchObject({
      id: QUOTE_ID,
      depositPercent: 30,
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
    const input = toQuoteUpdateInput({ id: QUOTE_ID, value: buildFormValues({ status: 'cancelled' }) });

    expect(input.status).toBe('cancelled');
  });

  it('rejects customer and product keys at the schema boundary', () => {
    expect(() =>
      QuoteUpdateInput.parse({
        ...toQuoteUpdateInput({ id: QUOTE_ID, value: buildFormValues() }),
        customer: { type: 'existing', customerId: CUSTOMER_ID },
      }),
    ).toThrow();
    expect(() =>
      QuoteUpdateInput.parse({
        ...toQuoteUpdateInput({ id: QUOTE_ID, value: buildFormValues() }),
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
