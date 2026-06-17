import { customers, products, quotes, user } from '@pkg/db';
import type { QuoteDocumentPdfRenderer } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { InMemoryStorageAdapter } from '../test/in-memory-storage-adapter.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { getQuoteDocuments } from './quote-document.js';
import { draftQuoteEmail, type QuoteDraftEmailMessage, type QuoteDraftEmailSender } from './quote-email-draft.js';
import { QuoteDraftEmailRecipientMissingError } from './quote-errors.js';

const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\n%fake quote document\n%%EOF\n');

const test = createTester(async ({ db }) => {
  const now = new Date();
  const rangeId = await createProductRangeFixture(db);
  const [salesPerson] = await db
    .insert(user)
    .values({
      createdAt: now,
      email: 'sales@example.com',
      emailVerified: true,
      id: 'draft-email-sales-user',
      name: 'Sales User',
      role: 'sales',
      updatedAt: now,
    })
    .returning();
  const [customer] = await db.insert(customers).values({ companyName: 'Acme Mining', email: null }).returning();
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      modelCode: 'DRAFT-EMAIL-001',
      name: 'Draft Email Product',
      rangeId,
    })
    .returning();

  if (!salesPerson || !customer || !product) {
    throw new Error('Draft email test setup did not return required rows');
  }

  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      productId: product.id,
      quotedBasePrice: 1000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: salesPerson.id,
      status: 'draft',
    })
    .returning();

  if (!quote) {
    throw new Error('Draft email test setup did not return a quote');
  }

  return { customer, product, quote, salesPerson };
});

function createHarness() {
  const storage = new InMemoryStorageAdapter();
  const sentMessages: QuoteDraftEmailMessage[] = [];

  const pdfRenderer: QuoteDocumentPdfRenderer = async () => PDF_BYTES;
  const sendEmail: QuoteDraftEmailSender = async (message) => {
    sentMessages.push(message);
  };

  return { pdfRenderer, sendEmail, sentMessages, storage };
}

describe('draftQuoteEmail', () => {
  test('emails the provided body with the quote PDF attached and saves a revision', async ({ context }) => {
    const harness = createHarness();

    const result = await draftQuoteEmail({
      actorUserId: context.salesPerson.id,
      db: context.db,
      emailBody: 'Hi Acme,\n\nHere is your quote.',
      input: { leadTime: '14 working days', quoteId: context.quote.id },
      pdfRenderer: harness.pdfRenderer,
      recipientEmail: 'sales@example.com',
      sendEmail: harness.sendEmail,
      storage: harness.storage,
    });

    expect(result.recipientEmail).toBe('sales@example.com');
    // No brochure is attached to the test Product, so generation reports the missing-brochure warning.
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'quote_document.product_brochure_missing' }),
    );

    expect(harness.sentMessages).toHaveLength(1);
    const [message] = harness.sentMessages;
    expect(message?.to).toBe('sales@example.com');
    expect(message?.text).toBe('Hi Acme,\n\nHere is your quote.');
    expect(message?.attachments).toHaveLength(1);
    expect(message?.attachments[0]?.contentType).toBe('application/pdf');
    expect(message?.attachments[0]?.filename).toMatch(/\.pdf$/);
    expect(message?.attachments[0]?.content).toEqual(PDF_BYTES);

    const documents = await getQuoteDocuments({ db: context.db, quoteId: context.quote.id });
    expect(documents).toHaveLength(1);
    expect(documents[0]?.metadata.revision).toBe(1);
  });

  test('throws when the recipient email is missing', async ({ context }) => {
    const harness = createHarness();

    await expect(
      draftQuoteEmail({
        actorUserId: context.salesPerson.id,
        db: context.db,
        emailBody: 'Hi Acme,\n\nHere is your quote.',
        input: { leadTime: '14 working days', quoteId: context.quote.id },
        pdfRenderer: harness.pdfRenderer,
        recipientEmail: '  ',
        sendEmail: harness.sendEmail,
        storage: harness.storage,
      }),
    ).rejects.toBeInstanceOf(QuoteDraftEmailRecipientMissingError);

    expect(harness.sentMessages).toHaveLength(0);
    const documents = await getQuoteDocuments({ db: context.db, quoteId: context.quote.id });
    expect(documents).toHaveLength(0);
  });

  test('does not persist a revision when sending fails', async ({ context }) => {
    const harness = createHarness();
    const failure = new Error('Email delivery failed');
    const sendEmail: QuoteDraftEmailSender = async () => {
      throw failure;
    };

    await expect(
      draftQuoteEmail({
        actorUserId: context.salesPerson.id,
        db: context.db,
        emailBody: 'Hi Acme,\n\nHere is your quote.',
        input: { leadTime: '14 working days', quoteId: context.quote.id },
        pdfRenderer: harness.pdfRenderer,
        recipientEmail: 'sales@example.com',
        sendEmail,
        storage: harness.storage,
      }),
    ).rejects.toBe(failure);

    const documents = await getQuoteDocuments({ db: context.db, quoteId: context.quote.id });
    expect(documents).toHaveLength(0);
  });
});
