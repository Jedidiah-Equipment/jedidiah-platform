import { auditEvents, documents, products, user } from '@pkg/db';
import { createUserAccessSummary, PRODUCT_DOCUMENT_MAX_BYTES } from '@pkg/domain';
import type { UserAccessSummary, UUID } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { InMemoryStorageAdapter } from '../test/in-memory-storage-adapter.js';
import {
  DocumentForbiddenError,
  DocumentPolicyViolationError,
  DuplicateDocumentFilenameError,
} from './document-errors.js';
import { deleteDocument, listProductDocuments, readDocument, uploadProductDocument } from './document-service.js';

const ACTOR_USER_ID = 'test-user-id';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: ACTOR_USER_ID,
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'DOC-TEST',
      name: 'Document Test Product',
    })
    .returning({ id: products.id });

  const [otherProduct] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'DOC-OTHER',
      name: 'Other Document Test Product',
    })
    .returning({ id: products.id });

  if (!product || !otherProduct) {
    throw new Error('Product insert did not return a row');
  }

  return {
    access: createUserAccessSummary({ role: 'admin', userId: ACTOR_USER_ID }),
    otherProductId: otherProduct.id,
    productId: product.id,
    storage: new InMemoryStorageAdapter(),
  };
});

describe('uploadProductDocument', () => {
  test('stores bytes, inserts a document row, and audits the storage key', async ({ context }) => {
    const bytes = pdfBytes();

    const document = await uploadProductDocument({
      access: context.access,
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: {
        bytes,
        contentType: 'application/pdf',
        filename: 'Part Book.pdf',
        productId: context.productId,
      },
      storage: context.storage,
    });

    expect(document).toMatchObject({
      byteSize: bytes.byteLength,
      contentType: 'application/pdf',
      filename: 'Part Book.pdf',
      productId: context.productId,
      uploaderEmail: 'test@example.com',
      uploaderName: 'Test User',
      uploaderUserId: ACTOR_USER_ID,
    });

    const [row] = await context.db.select().from(documents);
    expect(row).toMatchObject({
      filename: 'Part Book.pdf',
      productId: context.productId,
      uploaderUserId: ACTOR_USER_ID,
    });
    expect(row?.storageKey).toMatch(new RegExp(`^documents/product/${context.productId}/`));
    await expect(context.storage.get(row?.storageKey ?? '')).resolves.toMatchObject({
      byteSize: bytes.byteLength,
      contentType: 'application/pdf',
    });

    const [event] = await context.db.select().from(auditEvents);
    expect(event).toMatchObject({
      action: 'created',
      actorUserId: ACTOR_USER_ID,
      entityId: document.id,
      entityType: 'document',
      changes: null,
    });
  });

  test('rejects duplicate filenames case-insensitively per product', async ({ context }) => {
    await uploadPdf(context, { filename: 'Part Book.pdf', productId: context.productId });

    await expect(
      uploadPdf(context, { filename: 'part book.PDF', productId: context.productId }),
    ).rejects.toBeInstanceOf(DuplicateDocumentFilenameError);
    expect(context.storage.objects.size).toBe(1);

    await expect(
      uploadPdf(context, { filename: 'part book.PDF', productId: context.otherProductId }),
    ).resolves.toMatchObject({
      filename: 'part book.PDF',
      productId: context.otherProductId,
    });
  });

  test('rejects oversized and wrong-type uploads before insert', async ({ context }) => {
    await expect(
      uploadProductDocument({
        access: context.access,
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: {
          bytes: new Uint8Array(PRODUCT_DOCUMENT_MAX_BYTES + 1),
          contentType: 'application/pdf',
          filename: 'Too Large.pdf',
          productId: context.productId,
        },
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentPolicyViolationError);

    await expect(
      uploadProductDocument({
        access: context.access,
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: {
          bytes: new Uint8Array([1, 2, 3]),
          contentType: 'text/plain',
          filename: 'Notes.txt',
          productId: context.productId,
        },
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentPolicyViolationError);

    await expect(context.db.select().from(documents)).resolves.toEqual([]);
  });

  test('denies upload without product update access', async ({ context }) => {
    await expect(
      uploadPdf(context, {
        access: createUserAccessSummary({ role: 'sales', userId: ACTOR_USER_ID }),
        filename: 'Part Book.pdf',
        productId: context.productId,
      }),
    ).rejects.toBeInstanceOf(DocumentForbiddenError);
  });
});

describe('listProductDocuments and readDocument', () => {
  test('lists by owner and reads stored bytes', async ({ context }) => {
    const first = await uploadPdf(context, { filename: 'A.pdf', productId: context.productId });
    await uploadPdf(context, { filename: 'B.pdf', productId: context.otherProductId });

    await expect(
      listProductDocuments({
        access: context.access,
        db: context.db,
        productId: context.productId,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: first.id, filename: 'A.pdf' })]);

    const read = await readDocument({
      access: context.access,
      db: context.db,
      id: first.id,
      storage: context.storage,
    });

    expect(read.document).toMatchObject({ id: first.id, filename: 'A.pdf' });
    await expect(readAll(read.object.body)).resolves.toEqual(pdfBytes());
  });

  test('denies read without product read access', async ({ context }) => {
    const document = await uploadPdf(context, { filename: 'A.pdf', productId: context.productId });
    const access = createUserAccessSummary({ role: 'sales', userId: ACTOR_USER_ID });

    await expect(
      listProductDocuments({
        access,
        db: context.db,
        productId: context.productId,
      }),
    ).rejects.toBeInstanceOf(DocumentForbiddenError);

    await expect(
      readDocument({
        access,
        db: context.db,
        id: document.id,
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentForbiddenError);
  });
});

describe('deleteDocument', () => {
  test('removes the document row, keeps the stored object, and writes a delete audit event', async ({ context }) => {
    const document = await uploadPdf(context, { filename: 'Delete Me.pdf', productId: context.productId });
    const [row] = await context.db.select().from(documents);

    await deleteDocument({
      access: context.access,
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      id: document.id,
    });

    await expect(context.db.select().from(documents)).resolves.toEqual([]);
    await expect(context.storage.get(row?.storageKey ?? '')).resolves.toMatchObject({
      byteSize: pdfBytes().byteLength,
      contentType: 'application/pdf',
    });

    const events = await context.db.select().from(auditEvents);
    expect(events).toContainEqual(
      expect.objectContaining({
        action: 'deleted',
        actorUserId: ACTOR_USER_ID,
        entityId: document.id,
        entityType: 'document',
        changes: null,
      }),
    );
  });

  test('allows re-uploading the same filename after delete', async ({ context }) => {
    const document = await uploadPdf(context, { filename: 'Part Book.pdf', productId: context.productId });

    await deleteDocument({
      access: context.access,
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      id: document.id,
    });

    await expect(
      uploadPdf(context, { filename: 'part book.PDF', productId: context.productId }),
    ).resolves.toMatchObject({
      filename: 'part book.PDF',
      productId: context.productId,
    });
    expect(context.storage.objects.size).toBe(2);
  });

  test('denies delete without product update access', async ({ context }) => {
    const document = await uploadPdf(context, { filename: 'A.pdf', productId: context.productId });

    await expect(
      deleteDocument({
        access: createUserAccessSummary({ role: 'sales', userId: ACTOR_USER_ID }),
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        id: document.id,
      }),
    ).rejects.toBeInstanceOf(DocumentForbiddenError);
  });
});

function uploadPdf(
  context: {
    access: UserAccessSummary;
    db: Parameters<typeof uploadProductDocument>[0]['db'];
    storage: InMemoryStorageAdapter;
  },
  input: { access?: UserAccessSummary; filename: string; productId: UUID },
) {
  return uploadProductDocument({
    access: input.access ?? context.access,
    actorUserId: ACTOR_USER_ID,
    db: context.db,
    input: {
      bytes: pdfBytes(),
      contentType: 'application/pdf',
      filename: input.filename,
      productId: input.productId,
    },
    storage: context.storage,
  });
}

function pdfBytes(): Uint8Array {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
}

async function readAll(body: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of body) {
    chunks.push(chunk);
  }

  return new Uint8Array(chunks.flatMap((chunk) => [...chunk]));
}
