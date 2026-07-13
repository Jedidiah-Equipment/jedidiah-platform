import { createUserAccessSummary } from '@pkg/domain';
import { QuoteDetail } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import { GetQuoteInput, GetQuoteResponse, getQuoteDefinition, toGetQuoteResponse } from './get-quote.js';

const QUOTE_ID = '00000000-0000-4000-8000-000000000301';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000201';

const quote = QuoteDetail.parse({
  code: 'QUO-00001',
  createdAt: '2026-07-10T08:00:00.000Z',
  customerAddress: '1 Quarry Road',
  customerCompanyName: 'Acme Mining',
  customerContactPerson: 'A. Person',
  customerEmail: 'buyer@example.com',
  customerId: CUSTOMER_ID,
  customerPhone: '+27110000000',
  customerThumbnailDataUrl: 'data:image/webp;base64,YQ==',
  customerVatNumber: 'VAT-1',
  depositPercent: 30,
  deliveryIncluded: true,
  deliveryPrice: 0,
  discountPercent: 10,
  documentNotes: 'Deposit on order',
  id: QUOTE_ID,
  job: null,
  kind: 'product',
  lineItems: [],
  notes: 'Internal note',
  plannedDeliveryDate: '2026-08-01',
  preferredDeliveryDate: '2026-07-20',
  product: {
    assemblies: [],
    bays: [],
    buildTimeDays: 14,
    currencyCode: 'ZAR',
    description: 'Demo product',
    modelCode: 'DEMO-001',
    name: 'Demo Product',
    requiresVinNumber: false,
    thumbnailDataUrl: 'data:image/webp;base64,YQ==',
  },
  productId: PRODUCT_ID,
  quotedBasePrice: 1000,
  quotedCurrencyCode: 'ZAR',
  salesPersonEmail: 'sales@example.com',
  salesPersonId: 'test-user-id',
  salesPersonName: 'Test User',
  salesPersonThumbnailDataUrl: 'data:image/webp;base64,YQ==',
  selectedAssemblies: [],
  status: 'draft',
  statusChangedAt: '2026-07-10T08:00:00.000Z',
  updatedAt: '2026-07-10T09:00:00.000Z',
  validUntil: null,
  workTitle: null,
});

describe('getQuote contract', () => {
  test('requires a Quote UUID and describes the find follow-up', () => {
    expect(GetQuoteInput.parse({ id: QUOTE_ID })).toEqual({ id: QUOTE_ID });
    expect(() => GetQuoteInput.parse({ id: 'bad-id' })).toThrow();
    expect(getQuoteDefinition.description).toContain('findQuotes');
  });

  test('returns full Quote details and relationships without thumbnail data', () => {
    const response = toGetQuoteResponse(quote, createUserAccessSummary({ role: 'admin', userId: 'test-user-id' }));

    expect(GetQuoteResponse.parse(response)).toEqual(response);
    expect(response).toMatchObject({
      customerAddress: '1 Quarry Road',
      id: QUOTE_ID,
      links: {
        app: `/quotes/${QUOTE_ID}/edit`,
        customer: `/customers/${CUSTOMER_ID}/edit`,
        product: `/products/${PRODUCT_ID}/edit`,
      },
      quotedBasePrice: 1000,
    });
    expect(JSON.stringify(response)).not.toContain('thumbnailDataUrl');
    expect(toGetQuoteResponse(quote, createUserAccessSummary({ role: 'sales', userId: 'test-user-id' })).links).toEqual(
      { app: `/quotes/${QUOTE_ID}/edit` },
    );
  });
});
