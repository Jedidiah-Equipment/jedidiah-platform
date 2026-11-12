import type { ColumnFiltersState } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';

import { getQuoteListInputExtras } from './quote-table-input.js';

const CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440001';
const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440002';

describe('getQuoteListInputExtras', () => {
  it('reads every visible quote filter from the table columns', () => {
    const filters = [
      { id: 'customerCompanyName', value: CUSTOMER_ID },
      { id: 'offeringType', value: 'parts-sale' },
      { id: 'productName', value: PRODUCT_ID },
      { id: 'salesPersonName', value: 'sales-user-id' },
      { id: 'stage', value: ['awaiting-pricing', 'not-a-stage'] },
    ] satisfies ColumnFiltersState;

    expect(getQuoteListInputExtras(filters)).toEqual({
      filters: {
        customerId: CUSTOMER_ID,
        offeringType: 'parts-sale',
        productId: PRODUCT_ID,
        salesPersonId: 'sales-user-id',
        stages: ['awaiting-pricing'],
      },
    });
  });

  it('drops filter values the API does not accept', () => {
    const filters = [
      { id: 'offeringType', value: 'not-a-type' },
      { id: 'stage', value: 'draft' },
    ] satisfies ColumnFiltersState;

    expect(getQuoteListInputExtras(filters)).toEqual({
      filters: {
        customerId: undefined,
        offeringType: undefined,
        productId: undefined,
        salesPersonId: undefined,
        stages: [],
      },
    });
  });

  it('pins the customer of a customer-scoped table over the customer column filter', () => {
    const filters = [{ id: 'customerCompanyName', value: OTHER_CUSTOMER_ID }] satisfies ColumnFiltersState;

    expect(getQuoteListInputExtras(filters, CUSTOMER_ID)).toMatchObject({ filters: { customerId: CUSTOMER_ID } });
  });
});
