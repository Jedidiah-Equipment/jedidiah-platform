import * as core from '@pkg/core';
import { QuoteDetail, type UserAccessSummary } from '@pkg/schema';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AiContext } from '@/context.js';
import { createSilentLogger, mockSession } from '@/test/test-utils.js';
import { updateQuoteDefinition, updateQuoteTool } from './update-quote.js';

function createAiContext(access: UserAccessSummary | null = null): AiContext {
  return {
    access,
    brochureRenderer: vi.fn(async () => new Uint8Array()),
    db: {} as AiContext['db'],
    deliverQuoteDraftEmail: vi.fn(async () => ({ recipientEmail: 'test@example.com', warnings: [] })),
    log: createSilentLogger(),
    session: mockSession(access?.role ?? 'sales'),
    storage: {} as AiContext['storage'],
  };
}

const baseQuote = {
  code: 'QUO-00001',
  createdAt: '2026-06-17T08:00:00.000Z',
  customerAddress: null,
  customerCompanyName: 'Acme Mining',
  customerContactPerson: null,
  customerEmail: null,
  customerId: '00000000-0000-4000-8000-000000000101',
  customerPhone: null,
  customerThumbnailDataUrl: null,
  customerVatNumber: null,
  depositPercent: 30,
  deliveryIncluded: true,
  deliveryPrice: 0,
  discountPercent: 10,
  documentNotes: 'Deposit on order',
  id: '00000000-0000-4000-8000-000000000301',
  job: null,
  lineItems: [],
  notes: 'Internal note',
  plannedDeliveryDate: '2026-07-15',
  preferredDeliveryDate: '2026-07-10',
  quotedBasePrice: 1000,
  quotedCurrencyCode: 'ZAR',
  salesPersonEmail: 'sales@example.com',
  salesPersonId: 'test-user-id',
  salesPersonName: 'Test User',
  salesPersonThumbnailDataUrl: null,
  selectedAssemblies: [],
  status: 'draft',
  statusChangedAt: '2026-06-17T08:00:00.000Z',
  updatedAt: '2026-06-17T08:00:00.000Z',
  validUntil: null,
};

function productQuote(): QuoteDetail {
  return QuoteDetail.parse({
    ...baseQuote,
    kind: 'product',
    productId: '00000000-0000-4000-8000-000000000201',
    workTitle: null,
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
  });
}

function customQuote(): QuoteDetail {
  return QuoteDetail.parse({
    ...baseQuote,
    kind: 'custom',
    productId: null,
    workTitle: 'Hydraulic repair',
    product: null,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('updateQuoteTool', () => {
  test('is a quote:update write tool', () => {
    expect(updateQuoteTool.requiredPermission).toBe('quote:update');
    expect(updateQuoteDefinition.kind).toBe('write');
  });

  test('changes only the named field and reconstructs the product offering', async () => {
    const current = productQuote();
    vi.spyOn(core, 'getQuote').mockResolvedValue(current);
    const updateSpy = vi.spyOn(core, 'updateQuote').mockResolvedValue(current);

    await updateQuoteTool.handler({ id: current.id, status: 'sent' }, createAiContext());

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'test-user-id',
        input: expect.objectContaining({
          id: current.id,
          offering: { kind: 'product' },
          status: 'sent',
          salesPersonId: 'test-user-id',
          discountPercent: 10,
          depositPercent: 30,
          notes: 'Internal note',
          documentNotes: 'Deposit on order',
          plannedDeliveryDate: '2026-07-15',
          preferredDeliveryDate: '2026-07-10',
        }),
      }),
    );
    // Line items and assemblies are left untouched (omitted so core keeps the current rows).
    const passedInput = updateSpy.mock.calls[0]?.[0].input as Record<string, unknown>;
    expect(passedInput.lineItems).toBeUndefined();
    expect(passedInput.selectedAssemblies).toBeUndefined();
  });

  test('reconstructs the custom offering from the current Quote', async () => {
    const current = customQuote();
    vi.spyOn(core, 'getQuote').mockResolvedValue(current);
    const updateSpy = vi.spyOn(core, 'updateQuote').mockResolvedValue(current);

    await updateQuoteTool.handler({ id: current.id, plannedDeliveryDate: '2026-08-01' }, createAiContext());

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          offering: { kind: 'custom', workTitle: 'Hydraulic repair', basePrice: 1000 },
          plannedDeliveryDate: '2026-08-01',
          status: 'draft',
        }),
      }),
    );
  });
});
