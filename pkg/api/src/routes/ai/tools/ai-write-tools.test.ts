import * as core from '@pkg/core';
import { Customer, QuoteDetail, type UserAccessSummary } from '@pkg/schema';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/routes/ai/ai-context.js';
import { aiTools, dispatchToolCall } from '@/routes/ai/ai-tools.js';
import { mockSession } from '@/test/test-utils.js';
import { generateQuoteEmailBody } from '../actions/quote-email-body.js';
import { createCustomerTool } from './create-customer.js';
import { createQuoteTool } from './create-quote.js';
import { sendDraftQuoteEmailTool } from './send-draft-quote-email.js';

vi.mock('../actions/quote-email-body.js', () => ({
  generateQuoteEmailBody: vi.fn(async () => {
    throw new Error('sendDraftQuoteEmailTool should use the provided emailBody.');
  }),
}));

function createAiContext(access: UserAccessSummary | null = null): AiContext {
  return {
    access,
    db: {} as AiContext['db'],
    session: mockSession(access?.role ?? 'sales'),
    storage: {} as AiContext['storage'],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AI write tools', () => {
  test('createCustomer maps AI input through the core customer create schema', async () => {
    const customer = Customer.parse({
      address: null,
      companyName: 'Acme Mining',
      contactPerson: null,
      createdAt: '2026-06-17T08:00:00.000Z',
      email: null,
      id: '00000000-0000-4000-8000-000000000101',
      notes: null,
      phone: null,
      thumbnailDataUrl: null,
      updatedAt: '2026-06-17T08:00:00.000Z',
      vatNumber: null,
    });
    const createCustomerSpy = vi.spyOn(core, 'createCustomer').mockResolvedValue(customer);

    await expect(
      createCustomerTool.handler(
        {
          address: '',
          companyName: ' Acme Mining ',
          contactPerson: ' Jane Buyer ',
          email: null,
          notes: ' Needs follow-up ',
          phone: '',
          vatNumber: ' VAT-123 ',
        },
        createAiContext(),
      ),
    ).resolves.toEqual(customer);

    expect(createCustomerSpy).toHaveBeenCalledWith({
      actorUserId: 'test-user-id',
      db: expect.any(Object),
      input: {
        address: null,
        companyName: 'Acme Mining',
        contactPerson: 'Jane Buyer',
        email: null,
        notes: 'Needs follow-up',
        phone: null,
        thumbnailDataUrl: null,
        vatNumber: 'VAT-123',
      },
    });
  });

  test('createQuote maps AI input through the core quote create schema', async () => {
    const quote = createQuoteDetail();
    const createQuoteSpy = vi.spyOn(core, 'createQuote').mockResolvedValue(quote);

    await expect(
      createQuoteTool.handler(
        {
          customer: { type: 'inline', companyName: 'Acme Mining' },
          deliveryIncluded: false,
          deliveryPrice: 500,
          discountPercent: 10,
          documentNotes: ' 30% deposit ',
          notes: undefined,
          plannedDeliveryDate: '2026-07-15',
          preferredDeliveryDate: '2026-07-10',
          productId: '00000000-0000-4000-8000-000000000201',
          selectedAssemblies: [
            {
              productAssemblyId: '00000000-0000-4000-8000-000000000401',
              type: 'catalog',
            },
          ],
        },
        createAiContext(),
      ),
    ).resolves.toEqual(quote);

    expect(createQuoteSpy).toHaveBeenCalledWith({
      actorUserId: 'test-user-id',
      db: expect.any(Object),
      input: {
        customer: { type: 'inline', companyName: 'Acme Mining' },
        deliveryIncluded: false,
        deliveryPrice: 500,
        depositPercent: 0,
        discountPercent: 10,
        documentNotes: '30% deposit',
        notes: null,
        plannedDeliveryDate: '2026-07-15',
        preferredDeliveryDate: '2026-07-10',
        productId: '00000000-0000-4000-8000-000000000201',
        salesPersonId: 'test-user-id',
        selectedAssemblies: [
          {
            productAssemblyId: '00000000-0000-4000-8000-000000000401',
            type: 'catalog',
          },
        ],
        status: 'draft',
        validUntil: null,
      },
    });
  });

  test('sendDraftQuoteEmail delegates to the existing actor-recipient draft flow', async () => {
    const draftQuoteEmailSpy = vi.spyOn(core, 'draftQuoteEmail').mockResolvedValue({
      recipientEmail: 'sales@example.com',
      warnings: [],
    });
    const session = mockSession('sales');
    session.user.email = 'sales@example.com';
    const ctx = {
      ...createAiContext(),
      session,
    };

    await expect(
      sendDraftQuoteEmailTool.handler(
        {
          emailBody: 'Hello Acme,\n\nPlease find your draft quote attached.',
          leadTime: '14 working days',
          quoteId: '00000000-0000-4000-8000-000000000301',
        },
        ctx,
      ),
    ).resolves.toEqual({
      recipientEmail: 'sales@example.com',
      warnings: [],
    });

    expect(draftQuoteEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'test-user-id',
        db: ctx.db,
        input: {
          leadTime: '14 working days',
          quoteId: '00000000-0000-4000-8000-000000000301',
        },
        recipientEmail: 'sales@example.com',
        storage: ctx.storage,
      }),
    );
    const draftQuoteEmailArgs = draftQuoteEmailSpy.mock.calls[0]?.[0];

    await expect(draftQuoteEmailArgs?.generateEmailBody(createQuoteDetail())).resolves.toBe(
      'Hello Acme,\n\nPlease find your draft quote attached.',
    );
    expect(generateQuoteEmailBody).not.toHaveBeenCalled();
  });

  test('sendDraftQuoteEmail requires the AI-authored email body', async () => {
    await expect(
      sendDraftQuoteEmailTool.handler(
        {
          leadTime: '14 working days',
          quoteId: '00000000-0000-4000-8000-000000000301',
        },
        createAiContext(),
      ),
    ).rejects.toBeInstanceOf(z.ZodError);

    await expect(
      sendDraftQuoteEmailTool.handler(
        {
          emailBody: '   ',
          leadTime: '14 working days',
          quoteId: '00000000-0000-4000-8000-000000000301',
        },
        createAiContext(),
      ),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  test('dispatch projects write tool failures as tool errors', async () => {
    vi.spyOn(core, 'createQuote').mockRejectedValue(new Error('Quote includes an invalid customer.'));

    await expect(
      dispatchToolCall(
        { createQuote: aiTools.createQuote },
        'createQuote',
        {
          customer: { type: 'inline', companyName: 'Acme Mining' },
          documentNotes: null,
          notes: null,
          productId: '00000000-0000-4000-8000-000000000201',
        },
        createAiContext(),
      ),
    ).resolves.toEqual({
      error: 'Quote includes an invalid customer.',
      name: 'createQuote',
      ok: false,
    });
  });
});

function createQuoteDetail(): QuoteDetail {
  return QuoteDetail.parse({
    code: 1,
    createdAt: '2026-06-17T08:00:00.000Z',
    customerAddress: null,
    customerCompanyName: 'Acme Mining',
    customerContactPerson: null,
    customerEmail: null,
    customerId: '00000000-0000-4000-8000-000000000101',
    customerPhone: null,
    customerThumbnailDataUrl: null,
    customerVatNumber: null,
    depositPercent: 0,
    deliveryIncluded: true,
    deliveryPrice: 0,
    discountPercent: 0,
    documentNotes: null,
    id: '00000000-0000-4000-8000-000000000301',
    job: null,
    notes: null,
    plannedDeliveryDate: null,
    preferredDeliveryDate: null,
    productAssemblies: [],
    productBays: [],
    productBuildTimeDays: 14,
    productCurrencyCode: 'ZAR',
    productDescription: 'Demo product',
    productId: '00000000-0000-4000-8000-000000000201',
    productModelCode: 'DEMO-001',
    productName: 'Demo Product',
    productRequiresVinNumber: false,
    productThumbnailDataUrl: null,
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
  });
}
