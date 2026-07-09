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

function sampleQuote(): QuoteDetail {
  return QuoteDetail.parse({
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
    kind: 'product',
    lineItems: [],
    notes: 'Internal note',
    plannedDeliveryDate: '2026-07-15',
    preferredDeliveryDate: '2026-07-10',
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
    productId: '00000000-0000-4000-8000-000000000201',
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
    workTitle: null,
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

  test('forwards only the named low-risk fields so core keeps the rest under its row lock', async () => {
    const updateSpy = vi.spyOn(core, 'updateQuoteFields').mockResolvedValue(sampleQuote());

    await updateQuoteTool.handler({ id: '00000000-0000-4000-8000-000000000301', status: 'sent' }, createAiContext());

    expect(updateSpy).toHaveBeenCalledWith({
      actorUserId: 'test-user-id',
      db: expect.any(Object),
      input: { id: '00000000-0000-4000-8000-000000000301', status: 'sent' },
    });
    // No pricing/offering fields are ever supplied, so a concurrent commercial edit cannot be reverted.
    const passedInput = updateSpy.mock.calls[0]?.[0].input as Record<string, unknown>;
    expect(Object.keys(passedInput).sort()).toEqual(['id', 'status']);
    expect(passedInput).not.toHaveProperty('discountPercent');
    expect(passedInput).not.toHaveProperty('offering');
  });

  test('projects the updated Quote with a Quote link', () => {
    const projected = (updateQuoteDefinition.projectResult as (value: unknown) => { links: unknown[] })(sampleQuote());

    expect(projected.links).toContainEqual({
      entity: 'Quote',
      href: '/quotes/00000000-0000-4000-8000-000000000301/edit',
      label: 'QUO-00001',
    });
  });
});
