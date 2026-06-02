import { auditEvents, type Db, documents, products, user } from '@pkg/db';
import { describe, expect } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    role: 'product-editor',
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
    const caller = context.createCaller(mockSession('product-editor'));
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

async function createProduct(db: Db) {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'DOC-TRPC',
      name: 'Document TRPC Product',
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
