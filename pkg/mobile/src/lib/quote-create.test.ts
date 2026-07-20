import { describe, expect, it } from 'vitest';

import {
  clearQuoteKindFields,
  defaultQuoteSalesPersonId,
  QUOTE_CREATE_DEFAULT_VALUES,
  QuoteCreateFormValues,
  toQuoteCreateInput,
} from './quote-create';

describe('mobile quote creation', () => {
  it('builds the product quote payload and applies schema defaults', () => {
    const input = toQuoteCreateInput({
      ...QUOTE_CREATE_DEFAULT_VALUES,
      customerId: '4ffcb2c6-4e69-4108-a6a5-710accee0b48',
      productId: 'f36a4b28-d552-439c-8928-bf6da8aa42b2',
      salesPersonId: 'sales-user',
      status: 'sent',
    });

    expect(input).toEqual({
      customer: { customerId: '4ffcb2c6-4e69-4108-a6a5-710accee0b48', type: 'existing' },
      deliveryIncluded: true,
      deliveryPrice: 0,
      depositPercent: 0,
      discountPercent: 0,
      documentNotes: null,
      lineItems: [],
      notes: null,
      offering: { kind: 'product', productId: 'f36a4b28-d552-439c-8928-bf6da8aa42b2' },
      plannedDeliveryDate: null,
      preferredDeliveryDate: null,
      salesPersonId: 'sales-user',
      selectedAssemblies: [],
      status: 'sent',
      validUntil: null,
    });
  });

  it('builds a custom quote with a minimal inline customer', () => {
    const input = toQuoteCreateInput({
      ...QUOTE_CREATE_DEFAULT_VALUES,
      basePrice: '25000',
      customerMode: 'inline',
      inlineCompanyName: '  Boerdery Bpk  ',
      kind: 'custom',
      salesPersonId: 'sales-user',
      workTitle: '  On-site repair  ',
    });

    expect(input.customer).toEqual({
      address: null,
      companyName: 'Boerdery Bpk',
      contactPerson: null,
      email: null,
      phone: null,
      type: 'inline',
    });
    expect(input.offering).toEqual({ basePrice: 25_000, kind: 'custom', workTitle: 'On-site repair' });
  });

  it('reports conditional fields at their visible controls', () => {
    const productResult = QuoteCreateFormValues.safeParse(QUOTE_CREATE_DEFAULT_VALUES);
    expect(productResult.error?.issues.map(({ message, path }) => ({ message, path }))).toEqual([
      { message: 'Select or create a customer', path: ['customerId'] },
      { message: 'Select a product', path: ['productId'] },
      { message: 'Select a salesperson', path: ['salesPersonId'] },
    ]);

    const customResult = QuoteCreateFormValues.safeParse({
      ...QUOTE_CREATE_DEFAULT_VALUES,
      basePrice: '-1',
      customerMode: 'inline',
      kind: 'custom',
    });
    expect(customResult.error?.issues.map(({ message, path }) => ({ message, path }))).toEqual([
      { message: 'Select or create a customer', path: ['customerId'] },
      { message: 'Work title is required', path: ['workTitle'] },
      { message: 'Must be zero or greater', path: ['basePrice'] },
      { message: 'Select a salesperson', path: ['salesPersonId'] },
    ]);
  });

  it('clears fields belonging to the other quote kind', () => {
    expect(
      clearQuoteKindFields(
        {
          ...QUOTE_CREATE_DEFAULT_VALUES,
          productId: 'f36a4b28-d552-439c-8928-bf6da8aa42b2',
          rangeId: '7354e714-083a-44a7-9310-b6240c3a1890',
        },
        'custom',
      ),
    ).toMatchObject({ kind: 'custom', productId: '', rangeId: '' });

    expect(
      clearQuoteKindFields(
        { ...QUOTE_CREATE_DEFAULT_VALUES, basePrice: '900', kind: 'custom', workTitle: 'Repair' },
        'product',
      ),
    ).toMatchObject({ basePrice: '', kind: 'product', workTitle: '' });
  });

  it('defaults the salesperson to the logged-in user', () => {
    expect(defaultQuoteSalesPersonId({ id: 'current-user' })).toBe('current-user');
    expect(defaultQuoteSalesPersonId(null)).toBe('');
  });
});
