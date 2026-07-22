import * as quotesCore from '@pkg/core';
import { createUserAccessSummary, DEFAULT_CUSTOM_HOURLY_RATE } from '@pkg/domain';
import { QuoteDetail } from '@pkg/schema';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/context.js';

import {
  CreateQuoteInput,
  CreateQuoteResponse,
  createQuoteDefinition,
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
  deliveryIncluded: true,
  deliveryPrice: 0,
  discountPercent: 0,
  documentNotes: null,
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
    access: createUserAccessSummary({ role: 'admin', userId: 'test-user-id' }),
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

  test('defaults the hourly rate for a Custom Quote when the tool input omits it', () => {
    const input = CreateQuoteInput.parse({
      customer: { customerId: CUSTOMER_ID, type: 'existing' },
      offering: { basePrice: 2500, kind: 'custom', workTitle: 'Workshop repairs' },
    });

    expect(toCoreQuoteCreateInput(input, 'test-user-id').offering).toEqual({
      basePrice: 2500,
      hourlyRate: DEFAULT_CUSTOM_HOURLY_RATE,
      kind: 'custom',
      workItems: [],
      workTitle: 'Workshop repairs',
    });
  });

  test('preserves an explicit Custom Quote hourly rate from the tool input', () => {
    const input = CreateQuoteInput.parse({
      customer: { customerId: CUSTOMER_ID, type: 'existing' },
      offering: { basePrice: 2500, hourlyRate: 975, kind: 'custom', workTitle: 'Workshop repairs' },
    });

    expect(toCoreQuoteCreateInput(input, 'test-user-id').offering).toEqual({
      basePrice: 2500,
      hourlyRate: 975,
      kind: 'custom',
      workItems: [],
      workTitle: 'Workshop repairs',
    });
  });

  test('defaults and normalizes Quote input, creates it as the actor, and returns linked details', async () => {
    const input = CreateQuoteInput.parse({
      customer: { type: 'inline', companyName: ' Acme Mining ', contactPerson: ' Jane Buyer ', email: null },
      offering: { kind: 'product', productId: PRODUCT_ID },
    });
    const coreInput = toCoreQuoteCreateInput(input, 'test-user-id');
    const createSpy = vi.spyOn(quotesCore, 'createQuote').mockResolvedValue(quote);

    await expect(createQuoteDefinition.handler(input, createContext())).resolves.toEqual(
      toCreateQuoteResponse(quote, createContext().access),
    );

    expect(coreInput).toMatchObject({
      customer: {
        address: null,
        companyName: 'Acme Mining',
        contactPerson: 'Jane Buyer',
        email: null,
        phone: null,
        type: 'inline',
      },
      deliveryIncluded: true,
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
    expect(createSpy).toHaveBeenCalledWith({
      actorUserId: 'test-user-id',
      db: expect.any(Object),
      input: coreInput,
    });

    const response = toCreateQuoteResponse(quote, createContext().access);
    expect(CreateQuoteResponse.parse(response)).toEqual(response);
    expect(response.links).toEqual({
      app: `/quotes/${QUOTE_ID}/edit`,
      customer: `/customers/${CUSTOMER_ID}/edit`,
      product: `/products/${PRODUCT_ID}/edit`,
    });
    expect(
      toCreateQuoteResponse(quote, createUserAccessSummary({ role: 'sales', userId: 'test-user-id' })).links,
    ).toEqual({ app: `/quotes/${QUOTE_ID}/edit` });
    expect(JSON.stringify(response)).not.toContain('thumbnailDataUrl');
    expect(createQuoteDefinition.anyOfPermissions).toEqual(['quote:create']);
    expect(createQuoteDefinition.description).toContain('inline Customer');
    expect(createQuoteDefinition.description).toContain('findProducts');
    expect(createQuoteDefinition.description).toContain('findCustomers');
    expect(() => z.toJSONSchema(CreateQuoteInput)).not.toThrow();
  });
});
