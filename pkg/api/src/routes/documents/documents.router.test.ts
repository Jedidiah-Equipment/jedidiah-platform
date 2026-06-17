import { auditEvents, customers, type Db, documents, products, quotes, sql, user } from '@pkg/db';
import { describe, expect } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { createProductRangeFixture } from '@/test/product-range-fixtures.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    role: 'procurement-manager',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return {
    db,
    product: await createProduct(db),
  };
});

describe('documents.deleteByProduct', () => {
  test('deletes product documents through tRPC and audits the delete', async ({ context }) => {
    const caller = context.createCaller(mockSession('procurement-manager'));
    const document = await createProductDocument(context.db, context.product.id);

    await caller.documents.deleteByProduct({
      documentId: document.id,
      productId: context.product.id,
    });

    await expect(context.db.select().from(documents)).resolves.toEqual([]);
    await expect(context.db.select().from(auditEvents)).resolves.toEqual([
      expect.objectContaining({
        action: 'deleted',
        actorUserId: 'test-user-id',
        entityId: document.id,
        entityType: 'document',
      }),
    ]);
  });

  test('requires product update permission', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const document = await createProductDocument(context.db, context.product.id);

    await expect(
      caller.documents.deleteByProduct({
        documentId: document.id,
        productId: context.product.id,
      }),
    ).rejects.toThrow('You do not have permission to perform this action.');
  });
});

describe('documents.listByQuote', () => {
  test('lists quote documents newest first through quote read access', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const quote = await createQuote(context.db, context.product.id);
    const older = await createQuoteDocument(context.db, quote.id, {
      filename: 'Quote Revision 1.pdf',
      revision: 1,
    });
    const newer = await createQuoteDocument(context.db, quote.id, {
      filename: 'Quote Revision 2.pdf',
      revision: 2,
    });
    await context.db
      .update(documents)
      .set({ createdAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(sql`${documents.id} = ${older.id}`);
    await context.db
      .update(documents)
      .set({ createdAt: new Date('2026-01-02T00:00:00.000Z') })
      .where(sql`${documents.id} = ${newer.id}`);

    await expect(caller.documents.listByQuote({ quoteId: quote.id })).resolves.toEqual([
      expect.objectContaining({
        filename: 'Quote Revision 2.pdf',
        metadata: { revision: 2 },
        ownerType: 'quote',
        quoteId: quote.id,
      }),
      expect.objectContaining({
        filename: 'Quote Revision 1.pdf',
        metadata: { revision: 1 },
        ownerType: 'quote',
        quoteId: quote.id,
      }),
    ]);
  });

  test('requires quote read permission', async ({ context }) => {
    const caller = context.createCaller(mockSession('procurement-manager'));
    const quote = await createQuote(context.db, context.product.id);

    await expect(caller.documents.listByQuote({ quoteId: quote.id })).rejects.toThrow(
      'You do not have permission to perform this action.',
    );
  });
});

async function createProduct(db: Db) {
  const rangeId = await createProductRangeFixture(db);
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'DOC-TRPC',
      name: 'Document TRPC Product',
      rangeId,
    })
    .returning({ id: products.id });

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
}

async function createProductDocument(db: Db, productId: string) {
  const [document] = await db
    .insert(documents)
    .values({
      byteSize: 8,
      contentType: 'application/pdf',
      filename: 'Part Book.pdf',
      metadata: { type: 'part_book' },
      ownerType: 'product',
      productId,
      storageKey: `documents/product/${productId}/part-book.pdf`,
      uploaderUserId: 'test-user-id',
    })
    .returning({ id: documents.id });

  if (!document) {
    throw new Error('Document insert did not return a row');
  }

  return document;
}

async function createQuote(db: Db, productId: string) {
  const [customer] = await db
    .insert(customers)
    .values({
      companyName: 'Quote Document Customer',
      email: null,
    })
    .returning({ id: customers.id });
  if (!customer) throw new Error('Customer insert did not return a row');

  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      productId,
      quotedBasePrice: 1_000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'test-user-id',
      status: 'sent',
    })
    .returning({ id: quotes.id });
  if (!quote) throw new Error('Quote insert did not return a row');

  return quote;
}

async function createQuoteDocument(db: Db, quoteId: string, input: { filename: string; revision: number }) {
  const [document] = await db
    .insert(documents)
    .values({
      byteSize: 8,
      contentType: 'application/pdf',
      filename: input.filename,
      metadata: { revision: input.revision },
      ownerType: 'quote',
      quoteId,
      storageKey: `documents/quote/${quoteId}/${input.filename}`,
      uploaderUserId: 'test-user-id',
    })
    .returning({ id: documents.id });

  if (!document) {
    throw new Error('Document insert did not return a row');
  }

  return document;
}
