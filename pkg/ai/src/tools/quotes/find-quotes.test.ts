import { createUserAccessSummary } from '@pkg/domain';
import type { QuoteListResult } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import {
  FindQuotesInput,
  FindQuotesResponse,
  findQuotesDefinition,
  toCoreQuoteListInput,
  toFindQuotesResponse,
} from './find-quotes.js';

const QUOTE_ID = '00000000-0000-4000-8000-000000000301';
const CUSTOM_QUOTE_ID = '00000000-0000-4000-8000-000000000302';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000201';
const JOB_ID = '00000000-0000-4000-8000-000000000401';

describe('findQuotes contract', () => {
  test('describes the lightweight find-before-get workflow', () => {
    expect(findQuotesDefinition.name).toBe('findQuotes');
    expect(findQuotesDefinition.description).toContain('lightweight');
    expect(findQuotesDefinition.description).toContain('getQuote');
    expect(findQuotesDefinition.description).toContain('findCustomers');
    expect(findQuotesDefinition.description).toContain('findProducts');
  });

  test('maps a short Quote Code onto an exact unpaged Quote read', () => {
    const input = FindQuotesInput.parse({ by: 'code', quoteCode: '8' });

    expect(toCoreQuoteListInput(input)).toEqual({
      filters: { quoteCode: 'QUO-00008', statuses: ['draft', 'sent', 'accepted', 'rejected', 'cancelled'] },
      page: 1,
      pageSize: 0,
      search: '',
      sortBy: 'code',
      sortDirection: 'asc',
    });
  });

  test('requires exactly one supported Quote selector', () => {
    expect(() => FindQuotesInput.parse({ search: '8' })).toThrow();
    expect(() => FindQuotesInput.parse({ by: 'code', customerId: CUSTOMER_ID, quoteCode: 'QUO-00008' })).toThrow();
  });

  test.each([
    {
      expectedFilters: {
        customerId: CUSTOMER_ID,
        statuses: ['draft', 'sent', 'accepted', 'rejected', 'cancelled'],
      },
      input: { by: 'customer', customerId: CUSTOMER_ID } as const,
    },
    {
      expectedFilters: {
        productId: PRODUCT_ID,
        statuses: ['draft', 'sent', 'accepted', 'rejected', 'cancelled'],
      },
      input: { by: 'product', productId: PRODUCT_ID } as const,
    },
  ])('maps $input.by selection onto its exact Quote filter', ({ expectedFilters, input }) => {
    expect(toCoreQuoteListInput(FindQuotesInput.parse(input))).toEqual({
      filters: expectedFilters,
      page: 1,
      pageSize: 0,
      search: '',
      sortBy: 'code',
      sortDirection: 'asc',
    });
  });

  test('returns lightweight Product and Custom Quote matches with relationship links', () => {
    const result = {
      items: [
        {
          code: 'QUO-00001',
          createdAt: '2026-07-10T08:00:00.000Z',
          customerCompanyName: 'Acme Mining',
          customerId: CUSTOMER_ID,
          id: QUOTE_ID,
          job: { jobCode: 'JOB-00001', jobId: JOB_ID },
          kind: 'product',
          plannedDeliveryDate: '2026-08-01',
          product: {
            buildTimeDays: 14,
            currencyCode: 'ZAR',
            modelCode: 'DEMO-001',
            name: 'Demo Product',
          },
          productId: PRODUCT_ID,
          quotedBasePrice: 1000,
          quotedCurrencyCode: 'ZAR',
          status: 'draft',
          workTitle: null,
        },
        {
          code: 'QUO-00002',
          createdAt: '2026-07-10T08:00:00.000Z',
          customerCompanyName: 'Acme Mining',
          customerId: CUSTOMER_ID,
          id: CUSTOM_QUOTE_ID,
          job: null,
          kind: 'custom',
          plannedDeliveryDate: null,
          product: null,
          productId: null,
          quotedBasePrice: 2500,
          quotedCurrencyCode: 'ZAR',
          status: 'sent',
          workTitle: 'Hydraulic repair',
        },
      ],
    } as QuoteListResult;

    const response = toFindQuotesResponse(result, createUserAccessSummary({ role: 'admin', userId: 'test-user-id' }));

    expect(FindQuotesResponse.parse(response)).toEqual(response);
    expect(response[0]).toMatchObject({
      links: {
        app: `/quotes/${QUOTE_ID}/edit`,
        customer: `/customers/${CUSTOMER_ID}/edit`,
        job: `/jobs/${JOB_ID}`,
        product: `/products/${PRODUCT_ID}/edit`,
      },
    });
    expect(response[1]).toMatchObject({
      kind: 'custom',
      links: {
        app: `/quotes/${CUSTOM_QUOTE_ID}/edit`,
        customer: `/customers/${CUSTOMER_ID}/edit`,
      },
      product: null,
      workTitle: 'Hydraulic repair',
    });
    expect(response[1]?.links).not.toHaveProperty('product');

    expect(
      toFindQuotesResponse(result, createUserAccessSummary({ role: 'sales', userId: 'test-user-id' }))[0]?.links,
    ).toEqual({ app: `/quotes/${QUOTE_ID}/edit` });
  });
});
