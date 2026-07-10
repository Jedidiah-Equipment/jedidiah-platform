import * as quotesCore from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { QuoteDetail } from '@pkg/schema';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import type { AiV2Context } from '@/v2/context.js';

import {
  PatchQuoteInput,
  PatchQuoteResponse,
  patchQuoteDefinition,
  toCoreQuotePatchInput,
  toPatchQuoteResponse,
} from './patch-quote.js';

const QUOTE_ID = '00000000-0000-4000-8000-000000000301';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';
const PRODUCT_ASSEMBLY_ID = '00000000-0000-4000-8000-000000000201';

const quote = QuoteDetail.parse({
  code: 'QUO-00001',
  createdAt: '2026-07-10T08:00:00.000Z',
  customerAddress: null,
  customerCompanyName: 'Acme Mining',
  customerContactPerson: null,
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
  kind: 'custom',
  lineItems: [],
  notes: 'Updated note',
  plannedDeliveryDate: null,
  preferredDeliveryDate: null,
  product: null,
  productId: null,
  quotedBasePrice: 2500,
  quotedCurrencyCode: 'ZAR',
  salesPersonEmail: 'sales@example.com',
  salesPersonId: 'test-user-id',
  salesPersonName: 'Test User',
  salesPersonThumbnailDataUrl: null,
  selectedAssemblies: [],
  status: 'sent',
  statusChangedAt: '2026-07-10T08:00:00.000Z',
  updatedAt: '2026-07-10T09:00:00.000Z',
  validUntil: null,
  workTitle: 'Hydraulic repair',
});

function createContext(): AiV2Context {
  return {
    access: createUserAccessSummary({ role: 'admin', userId: 'test-user-id' }),
    db: {} as AiV2Context['db'],
    session: {
      user: {
        assistantEnabled: true,
        email: 'sales@example.com',
        id: 'test-user-id',
      },
    },
  } as AiV2Context;
}

describe('patchQuote v2 contract', () => {
  test('passes named Quote changes, line items, and assemblies to core and returns linked details', async () => {
    const input = PatchQuoteInput.parse({
      id: QUOTE_ID,
      lineItems: [{ name: ' Calibration ', quantity: 2, unitPrice: 450 }],
      notes: ' Updated note ',
      plannedDeliveryDate: null,
      selectedAssemblies: [{ type: 'catalog', productAssemblyId: PRODUCT_ASSEMBLY_ID }],
    });
    const coreInput = toCoreQuotePatchInput(input);
    const patchSpy = vi.spyOn(quotesCore, 'patchQuote').mockResolvedValue(quote);

    await expect(patchQuoteDefinition.handler(input, createContext())).resolves.toEqual(
      toPatchQuoteResponse(quote, createContext().access),
    );

    expect(coreInput).toEqual({
      id: QUOTE_ID,
      lineItems: [{ name: 'Calibration', quantity: 2, unitPrice: 450 }],
      notes: 'Updated note',
      plannedDeliveryDate: null,
      selectedAssemblies: [{ type: 'catalog', productAssemblyId: PRODUCT_ASSEMBLY_ID }],
    });
    expect(coreInput).not.toHaveProperty('status');
    expect(coreInput).not.toHaveProperty('discountPercent');
    expect(patchSpy).toHaveBeenCalledWith({
      actorUserId: 'test-user-id',
      db: expect.any(Object),
      input: coreInput,
    });

    const response = toPatchQuoteResponse(quote, createContext().access);
    expect(PatchQuoteResponse.parse(response)).toEqual(response);
    expect(response.links).toEqual({
      app: `/quotes/${QUOTE_ID}/edit`,
      customer: `/customers/${CUSTOMER_ID}/edit`,
    });
    expect(
      toPatchQuoteResponse(quote, createUserAccessSummary({ role: 'sales', userId: 'test-user-id' })).links,
    ).toEqual({ app: `/quotes/${QUOTE_ID}/edit` });
    expect(patchQuoteDefinition.requiredPermission).toEqual(['quote:update']);
    expect(patchQuoteDefinition.description).toContain('findQuotes');
    expect(patchQuoteDefinition.description).toContain('accepted or rejected');
    expect(patchQuoteDefinition.description).toContain('replace the complete collection');
    expect(() => z.toJSONSchema(PatchQuoteInput)).not.toThrow();
  });
});
