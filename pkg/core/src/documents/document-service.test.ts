import { auditEvents, customers, documents, jobs, products, quotes, user } from '@pkg/db';
import { PRODUCT_DOCUMENT_MAX_BYTES } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { readJobDocument } from '../jobs/job-read-service.js';
import {
  createProductDocument,
  deleteProductDocument,
  getProductDocuments,
  readProductDocument,
} from '../products/product-service.js';
import { createTester } from '../test/create-tester.js';
import { InMemoryStorageAdapter } from '../test/in-memory-storage-adapter.js';
import { DocumentPolicyViolationError, DuplicateDocumentFilenameError } from './document-errors.js';

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
    otherProductId: otherProduct.id,
    productId: product.id,
    storage: new InMemoryStorageAdapter(),
  };
});

describe('createProductDocument', () => {
  test('stores bytes, inserts a document row, and audits the storage key', async ({ context }) => {
    const bytes = pdfBytes();

    const document = await createProductDocument({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: {
        bytes,
        contentType: 'application/pdf',
        filename: 'Part Book.pdf',
        metadata: { type: 'part_book' },
        productId: context.productId,
      },
      storage: context.storage,
    });

    expect(document).toMatchObject({
      byteSize: bytes.byteLength,
      contentType: 'application/pdf',
      filename: 'Part Book.pdf',
      metadata: { type: 'part_book' },
      productId: context.productId,
      uploaderEmail: 'test@example.com',
      uploaderName: 'Test User',
      uploaderUserId: ACTOR_USER_ID,
    });

    const [row] = await context.db.select().from(documents);
    expect(row).toMatchObject({
      contentType: 'application/pdf',
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
      changes: {
        byteSize: {
          from: null,
          to: bytes.byteLength,
        },
        contentType: {
          from: null,
          to: 'application/pdf',
        },
        filename: {
          from: null,
          to: 'Part Book.pdf',
        },
        metadata: {
          from: null,
          to: { type: 'part_book' },
        },
        productId: {
          from: null,
          to: context.productId,
        },
        storageKey: {
          from: null,
          to: row?.storageKey,
        },
      },
    });
  });

  test('stores the server-verified content type instead of the declared upload type', async ({ context }) => {
    const document = await createProductDocument({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: {
        bytes: pdfBytes(),
        contentType: 'application/octet-stream',
        filename: 'Odd Browser Mime.pdf',
        metadata: { type: 'part_book' },
        productId: context.productId,
      },
      storage: context.storage,
    });

    expect(document.contentType).toBe('application/pdf');

    const [row] = await context.db.select().from(documents);
    expect(row?.contentType).toBe('application/pdf');
    await expect(context.storage.get(row?.storageKey ?? '')).resolves.toMatchObject({
      contentType: 'application/pdf',
    });
  });

  test('stores server-verified image content types', async ({ context }) => {
    const document = await createProductDocument({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: {
        bytes: pngBytes(),
        contentType: 'application/octet-stream',
        filename: 'Machine Diagram.png',
        metadata: { type: 'brochure' },
        productId: context.productId,
      },
      storage: context.storage,
    });

    expect(document.contentType).toBe('image/png');

    const [row] = await context.db.select().from(documents);
    expect(row?.contentType).toBe('image/png');
    await expect(context.storage.get(row?.storageKey ?? '')).resolves.toMatchObject({
      contentType: 'image/png',
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
      createProductDocument({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: {
          bytes: new Uint8Array(PRODUCT_DOCUMENT_MAX_BYTES + 1),
          contentType: 'application/pdf',
          filename: 'Too Large.pdf',
          metadata: { type: 'part_book' },
          productId: context.productId,
        },
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentPolicyViolationError);

    await expect(
      createProductDocument({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: {
          bytes: new Uint8Array([1, 2, 3]),
          contentType: 'application/pdf',
          filename: 'Renamed.pdf',
          metadata: { type: 'part_book' },
          productId: context.productId,
        },
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentPolicyViolationError);

    await expect(context.db.select().from(documents)).resolves.toEqual([]);
    expect(context.storage.objects.size).toBe(0);
  });

  test('rejects invalid or missing metadata before storing anything', async ({ context }) => {
    await expect(
      createProductDocument({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: {
          bytes: pdfBytes(),
          contentType: 'application/pdf',
          filename: 'Unknown Type.pdf',
          metadata: { type: 'manual' },
          productId: context.productId,
        },
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentPolicyViolationError);

    await expect(
      createProductDocument({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: {
          bytes: pdfBytes(),
          contentType: 'application/pdf',
          filename: 'Missing Type.pdf',
          metadata: {},
          productId: context.productId,
        },
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentPolicyViolationError);

    await expect(context.db.select().from(documents)).resolves.toEqual([]);
    expect(context.storage.objects.size).toBe(0);
  });
});

describe('getProductDocuments and readProductDocument', () => {
  test('lists by owner and reads stored bytes', async ({ context }) => {
    const first = await uploadPdf(context, { filename: 'A.pdf', productId: context.productId, type: 'sop' });
    await uploadPdf(context, { filename: 'B.pdf', productId: context.otherProductId });

    await expect(
      getProductDocuments({
        db: context.db,
        productId: context.productId,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: first.id, filename: 'A.pdf', metadata: { type: 'sop' } })]);

    const read = await readProductDocument({
      db: context.db,
      documentId: first.id,
      productId: context.productId,
      storage: context.storage,
    });

    expect(read.document).toMatchObject({ contentType: 'application/pdf', id: first.id, filename: 'A.pdf' });
    await expect(readAll(read.object.body)).resolves.toEqual(pdfBytes());
  });

  test('serves the persisted verified content type when storage metadata differs', async ({ context }) => {
    const document = await uploadPdf(context, { filename: 'A.pdf', productId: context.productId });
    const [row] = await context.db.select().from(documents);
    const stored = context.storage.objects.get(row?.storageKey ?? '');

    if (!stored) {
      throw new Error('Expected uploaded object to exist');
    }

    stored.contentType = 'application/octet-stream';

    const read = await readProductDocument({
      db: context.db,
      documentId: document.id,
      productId: context.productId,
      storage: context.storage,
    });

    expect(read.document.contentType).toBe('application/pdf');
    expect(read.object.contentType).toBe('application/octet-stream');
  });

  test('reads job-owned snapshot document bytes', async ({ context }) => {
    const job = await createJobOwner(context.db, context.productId);
    await context.storage.put({
      body: pdfBytes(),
      byteSize: pdfBytes().byteLength,
      contentType: 'application/pdf',
      key: 'documents/product/source/job-part-book.pdf',
    });
    const [snapshot] = await context.db
      .insert(documents)
      .values({
        byteSize: pdfBytes().byteLength,
        contentType: 'application/pdf',
        filename: 'Job Part Book.pdf',
        jobId: job.id,
        metadata: { type: 'part_book' },
        ownerType: 'job',
        sourceProductId: context.productId,
        storageKey: 'documents/product/source/job-part-book.pdf',
        uploaderUserId: ACTOR_USER_ID,
      })
      .returning();
    if (!snapshot) throw new Error('Document insert did not return a row');

    const read = await readJobDocument({
      db: context.db,
      documentId: snapshot.id,
      jobId: job.id,
      storage: context.storage,
    });

    expect(read.document).toMatchObject({
      filename: 'Job Part Book.pdf',
      jobId: job.id,
      ownerType: 'job',
      productId: null,
      sourceProductId: context.productId,
    });
    await expect(readAll(read.object.body)).resolves.toEqual(pdfBytes());
  });
});

describe('deleteProductDocument', () => {
  test('removes the document row, keeps the stored object, and writes a delete audit event', async ({ context }) => {
    const document = await uploadPdf(context, { filename: 'Delete Me.pdf', productId: context.productId });
    const [row] = await context.db.select().from(documents);

    await deleteProductDocument({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      documentId: document.id,
      productId: context.productId,
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
        changes: {
          byteSize: {
            from: pdfBytes().byteLength,
            to: null,
          },
          contentType: {
            from: 'application/pdf',
            to: null,
          },
          filename: {
            from: 'Delete Me.pdf',
            to: null,
          },
          metadata: {
            from: { type: 'part_book' },
            to: null,
          },
          productId: {
            from: context.productId,
            to: null,
          },
          storageKey: {
            from: row?.storageKey,
            to: null,
          },
        },
      }),
    );
  });

  test('allows re-uploading the same filename after delete', async ({ context }) => {
    const document = await uploadPdf(context, { filename: 'Part Book.pdf', productId: context.productId });

    await deleteProductDocument({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      documentId: document.id,
      productId: context.productId,
    });

    await expect(
      uploadPdf(context, { filename: 'part book.PDF', productId: context.productId }),
    ).resolves.toMatchObject({
      filename: 'part book.PDF',
      productId: context.productId,
    });
    expect(context.storage.objects.size).toBe(2);
  });
});

function uploadPdf(
  context: {
    db: Parameters<typeof createProductDocument>[0]['db'];
    storage: InMemoryStorageAdapter;
  },
  input: { filename: string; productId: UUID; type?: 'sop' | 'part_book' | 'brochure' },
) {
  return createProductDocument({
    actorUserId: ACTOR_USER_ID,
    db: context.db,
    input: {
      bytes: pdfBytes(),
      contentType: 'application/pdf',
      filename: input.filename,
      metadata: { type: input.type ?? 'part_book' },
      productId: input.productId,
    },
    storage: context.storage,
  });
}

async function createJobOwner(db: Parameters<typeof readJobDocument>[0]['db'], productId: UUID) {
  const [customer] = await db
    .insert(customers)
    .values({
      companyName: 'Document Job Customer',
      email: null,
    })
    .returning();
  if (!customer) throw new Error('Customer insert did not return a row');

  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      productId,
      quotedBasePrice: 1_000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: ACTOR_USER_ID,
      status: 'accepted',
    })
    .returning();
  if (!quote) throw new Error('Quote insert did not return a row');

  const [job] = await db
    .insert(jobs)
    .values({
      productId,
      productSerialNumber: 'DOC-TEST260001',
      productSerialPrefix: 'DOC-TEST',
      productSerialSequence: 1,
      productSerialYear: 26,
      quoteId: quote.id,
    })
    .returning();
  if (!job) throw new Error('Job insert did not return a row');

  return job;
}

function pdfBytes(): Uint8Array {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
}

function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

async function readAll(body: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of body) {
    chunks.push(chunk);
  }

  return new Uint8Array(chunks.flatMap((chunk) => [...chunk]));
}
