import { products, user } from '@pkg/db';
import { describe, expect, vi } from 'vitest';

import { emailSender } from '@/email/index.js';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

// The route generates the email body via OpenAI; stub it so the test stays offline and deterministic.
vi.mock('../ai/actions/quote-email-body.js', () => ({
  generateQuoteEmailBody: vi.fn(async () => 'Drafted quote email body.'),
}));

const test = createTester(async ({ db }) => {
  const now = new Date();
  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role: 'sales',
    updatedAt: now,
  });
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      modelCode: 'DRAFT-EMAIL-ROUTER-001',
      name: 'Draft Email Router Product',
      rangeId: '00000000-0000-4000-8000-000000000488',
    })
    .returning();

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return { product };
});

describe('quotes.draftEmail', () => {
  test('emails the quote PDF to the actor and reports the recipient', async ({ context }) => {
    // Spy on the shared sender so the assertion holds regardless of the ambient email provider.
    const sendSpy = vi.spyOn(emailSender, 'send').mockResolvedValue();

    try {
      const caller = context.createCaller(mockSession('sales'));
      const quote = await caller.quotes.create({
        customer: { type: 'inline', companyName: 'Acme Mining' },
        documentNotes: '30% deposit, balance on delivery',
        notes: null,
        productId: context.product.id,
        salesPersonId: 'test-user-id',
        status: 'draft',
      });

      const result = await caller.quotes.draftEmail({ leadTime: '14 working days', quoteId: quote.id });

      expect(result.recipientEmail).toBe('test@example.com');
      expect(sendSpy).toHaveBeenCalledTimes(1);

      const payload = sendSpy.mock.calls[0]?.[0];
      expect(payload?.to).toBe('test@example.com');
      expect(payload?.type).toBe('quote-draft');
      expect(payload?.attachments).toHaveLength(1);
      expect(payload?.attachments?.[0]?.filename).toMatch(/\.pdf$/);
      expect(payload?.attachments?.[0]?.content).toBeInstanceOf(Uint8Array);
    } finally {
      sendSpy.mockRestore();
    }
  });
});
