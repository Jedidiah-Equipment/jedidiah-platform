import { accessForRole } from '@pkg/domain/testing';
import { QuoteDetail } from '@pkg/schema/equipment';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/equipment/context.js';

import {
  CreateQuoteInput,
  CreateQuoteResponse,
  toCoreQuoteCreateInput,
  toCreateQuoteResponse,
} from './create-quote.js';

const QUOTE_ID = '00000000-0000-4000-8000-000000000301';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000201';

const quote = QuoteDetail.parse({
  code: 'QUO-00001',
  createdAt: '2026-07-10T08:00:00.000Z',
  customerAddress: null,
  customerCompanyName: 'Acme Mining',
  customerContactPerson: 'Jane Buyer',
  customerEmail: null,
  customerId: CUSTOMER_ID,
  customerPhone: null,
  customerThumbnailDataUrl: null,
  customerVatNumber: null,
  depositPercent: 0,
  deliveryTerms: 'included',
  deliveryPrice: 0,
  discountPercent: 0,
  documentNotes: null,
  hasEverSourcedJob: false,
  id: QUOTE_ID,
  job: null,
  kind: 'product',
  notes: null,
  plannedDeliveryDate: null,
  preferredDeliveryDate: null,
  product: {
    assemblies: [],
    bays: [],
    buildTimeDays: 14,
    currencyCode: 'ZAR',
    description: 'Demo product',
    modelCode: 'DEMO-001',
    name: 'Demo Product',
    requiresVinNumber: false,
    thumbnailDataUrl: null,
  },
  productId: PRODUCT_ID,
  quotedBasePrice: 1000,
  quotedCurrencyCode: 'ZAR',
  salesPersonEmail: 'sales@example.com',
  salesPersonId: 'test-user-id',
  salesPersonName: 'Test User',
  salesPersonThumbnailDataUrl: null,
  selectedAssemblies: [],
  status: 'draft',
  statusChangedAt: '2026-07-10T08:00:00.000Z',
  updatedAt: '2026-07-10T09:00:00.000Z',
  validUntil: null,
  workTitle: null,
});

function createContext(): AiContext {
  return {
    access: accessForRole('admin', 'test-user-id'),
    db: {} as AiContext['db'],
    session: {
      user: {
        assistantEnabled: true,
        email: 'sales@example.com',
        id: 'test-user-id',
      },
    },
  } as AiContext;
}

describe('createQuote contract', () => {
  test('forwards delivery terms to the core create input', () => {
    const input = CreateQuoteInput.parse({
      customer: { customerId: CUSTOMER_ID, type: 'existing' },
      deliveryTerms: 'ex_factory',
      offering: { kind: 'product', productId: PRODUCT_ID },
    });

    expect(toCoreQuoteCreateInput(input, 'test-user-id')).toMatchObject({
      deliveryPrice: 0,
      deliveryTerms: 'ex_factory',
    });
  });

  test('requires and forwards a reason when creating a cancelled Quote', () => {
    expect(() =>
      CreateQuoteInput.parse({
        customer: { customerId: CUSTOMER_ID, type: 'existing' },
        offering: { kind: 'product', productId: PRODUCT_ID },
        status: 'cancelled',
      }),
    ).toThrow('Cancellation reason is required');
    expect(() =>
      CreateQuoteInput.parse({
        cancellationReason: '   ',
        customer: { customerId: CUSTOMER_ID, type: 'existing' },
        offering: { kind: 'product', productId: PRODUCT_ID },
        status: 'cancelled',
      }),
    ).toThrow('Cancellation reason is required');

    const input = CreateQuoteInput.parse({
      cancellationReason: '  Customer withdrew the project  ',
      customer: { customerId: CUSTOMER_ID, type: 'existing' },
      offering: { kind: 'product', productId: PRODUCT_ID },
      status: 'cancelled',
    });

    expect(toCoreQuoteCreateInput(input, 'test-user-id')).toMatchObject({
      cancellationReason: 'Customer withdrew the project',
      status: 'cancelled',
    });
  });

  test('creates a Custom Quote from a Work Title alone, with pricing left to its Work Items', () => {
    const input = CreateQuoteInput.parse({
      customer: { customerId: CUSTOMER_ID, type: 'existing' },
      offering: { kind: 'custom', workTitle: 'Workshop repairs' },
    });

    expect(toCoreQuoteCreateInput(input, 'test-user-id').offering).toEqual({
      isPartsSale: false,
      kind: 'custom',
      workItems: [],
      workTitle: 'Workshop repairs',
    });
  });

  test('creates a Parts Sale as a Custom Quote flagged at creation', () => {
    const input = CreateQuoteInput.parse({
      customer: { customerId: CUSTOMER_ID, type: 'existing' },
      offering: { isPartsSale: true, kind: 'custom', workTitle: 'Parts sale' },
    });

    expect(toCoreQuoteCreateInput(input, 'test-user-id').offering).toMatchObject({
      isPartsSale: true,
      kind: 'custom',
    });
  });

  test('rejects a base price or hourly rate on a Custom Quote offering', () => {
    expect(() =>
      CreateQuoteInput.parse({
        customer: { customerId: CUSTOMER_ID, type: 'existing' },
        offering: { basePrice: 2500, hourlyRate: 975, kind: 'custom', workTitle: 'Workshop repairs' },
      }),
    ).toThrow();
  });

  test('defaults and normalizes Quote input and projects linked details', () => {
    const input = CreateQuoteInput.parse({
      customer: {
        type: 'inline',
        companyName: ' Acme Mining ',
        contactPerson: ' Jane Buyer ',
        email: null,
      },
      offering: { kind: 'product', productId: PRODUCT_ID },
    });
    const coreInput = toCoreQuoteCreateInput(input, 'test-user-id');
    expect(coreInput).toMatchObject({
      customer: {
        address: null,
        companyName: 'Acme Mining',
        contactPerson: 'Jane Buyer',
        email: null,
        phone: null,
        type: 'inline',
      },
      deliveryTerms: 'included',
      deliveryPrice: 0,
      depositPercent: 0,
      discountPercent: 0,
      documentNotes: null,
      notes: null,
      offering: { kind: 'product', productId: PRODUCT_ID },
      salesPersonId: 'test-user-id',
      selectedAssemblies: [],
      status: 'draft',
    });
    const response = toCreateQuoteResponse(quote, createContext().access);
    expect(CreateQuoteResponse.parse(response)).toEqual(response);
    expect(response.links).toEqual({
      app: `/equipment/quotes/${QUOTE_ID}/edit`,
      customer: `/equipment/customers/${CUSTOMER_ID}/edit`,
      product: `/equipment/products/${PRODUCT_ID}/edit`,
    });
    expect(toCreateQuoteResponse(quote, accessForRole('sales', 'test-user-id')).links).toEqual({
      app: `/equipment/quotes/${QUOTE_ID}/edit`,
    });
    expect(JSON.stringify(response)).not.toContain('thumbnailDataUrl');
    expect(() => z.toJSONSchema(CreateQuoteInput)).not.toThrow();
  });
});
