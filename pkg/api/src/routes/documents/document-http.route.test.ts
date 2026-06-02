import fastifyMultipart from '@fastify/multipart';
import type { StorageAdapter, StoragePutInput, StoredObject } from '@pkg/core';
import { customers, type Db, documents, jobs, products, quotes, user } from '@pkg/db';
import type { UUID } from '@pkg/schema';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const routeTestState = vi.hoisted(() => ({
  db: null as unknown,
  session: null as unknown,
}));

vi.mock('@pkg/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pkg/db')>();
  const dbProxy = new Proxy({} as Db, {
    get(_target, property) {
      const db = routeTestState.db as Db | null;

      if (!db) {
        throw new Error('Route test database was not initialised');
      }

      const value = db[property as keyof Db];

      return typeof value === 'function' ? value.bind(db) : value;
    },
  });

  return {
    ...actual,
    db: dbProxy,
  };
});

vi.mock('../../auth/session.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/session.js')>();

  return {
    ...actual,
    getSessionFromHeaders: vi.fn(async () => routeTestState.session),
  };
});

const test = createTester(async ({ db }) => {
  routeTestState.db = db;
  routeTestState.session = mockSession();
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return {
    db,
    product: await createProduct(db),
  };
});

const openApps: FastifyInstance[] = [];

beforeEach(() => {
  routeTestState.session = mockSession();
});

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('document HTTP routes', () => {
  test('downloads product documents through the owner-scoped Product route', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createDocumentApp(storage);
    const document = await createProductDocumentRow({
      db: context.db,
      productId: context.product.id,
      storage,
    });

    const response = await app.inject(`/api/products/${context.product.id}/documents/${document.id}/download`);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-length']).toBe(String(pdfBytes().byteLength));
    expect(response.rawPayload).toEqual(Buffer.from(pdfBytes()));
    expect(storage.gets).toEqual([`documents/product/${context.product.id}/part-book.pdf`]);
  });

  test('downloads job documents through the owner-scoped Job route', async ({ context }) => {
    routeTestState.session = mockSession('job-supervisor');
    const storage = new MemoryStorage();
    const app = await createDocumentApp(storage);
    const job = await createJobOwner(context.db, context.product.id);
    const document = await createJobDocumentRow({
      db: context.db,
      jobId: job.id,
      productId: context.product.id,
      storage,
    });

    const response = await app.inject(`/api/jobs/${job.id}/documents/${document.id}/download`);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-length']).toBe(String(pdfBytes().byteLength));
    expect(response.rawPayload).toEqual(Buffer.from(pdfBytes()));
    expect(storage.gets).toEqual([`documents/product/${context.product.id}/job-part-book.pdf`]);
  });

  test('authorizes product document writes before reading multipart content', async ({ context }) => {
    routeTestState.session = mockSession('sales');
    const app = await createDocumentApp(new MemoryStorage());

    const response = await app.inject({
      method: 'POST',
      url: `/api/products/${context.product.id}/documents`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      data: {
        appCode: 'document.forbidden',
      },
      message: 'You do not have permission to upload Product documents.',
    });
  });

  test('does not register the generic document download route', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createDocumentApp(storage);
    const document = await createProductDocumentRow({
      db: context.db,
      productId: context.product.id,
      storage,
    });

    const response = await app.inject(`/api/documents/${document.id}/download`);

    expect(response.statusCode).toBe(404);
  });

  test('does not register product document delete as an HTTP route', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createDocumentApp(storage);
    const document = await createProductDocumentRow({
      db: context.db,
      productId: context.product.id,
      storage,
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/products/${context.product.id}/documents/${document.id}`,
    });

    expect(response.statusCode).toBe(404);
  });
});

async function createDocumentApp(storage: StorageAdapter) {
  const { registerDocumentHttpRoutes } = await import('./document-http.route.js');
  const app = Fastify();

  await app.register(fastifyMultipart);
  await registerDocumentHttpRoutes(app, storage);
  await app.ready();
  openApps.push(app);

  return app;
}

async function createProduct(db: Db) {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'DOC-HTTP',
      name: 'Document HTTP Product',
    })
    .returning({ id: products.id });

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
}

async function createProductDocumentRow({
  db,
  productId,
  storage,
}: {
  db: Db;
  productId: UUID;
  storage: MemoryStorage;
}) {
  const storageKey = `documents/product/${productId}/part-book.pdf`;
  await storage.put({
    body: pdfBytes(),
    byteSize: pdfBytes().byteLength,
    contentType: 'application/pdf',
    key: storageKey,
  });
  const [document] = await db
    .insert(documents)
    .values({
      byteSize: pdfBytes().byteLength,
      contentType: 'application/pdf',
      filename: 'Part Book.pdf',
      ownerType: 'product',
      productId,
      storageKey,
      uploaderUserId: 'test-user-id',
    })
    .returning({ id: documents.id });

  if (!document) {
    throw new Error('Document insert did not return a row');
  }

  return document;
}

async function createJobDocumentRow({
  db,
  jobId,
  productId,
  storage,
}: {
  db: Db;
  jobId: UUID;
  productId: UUID;
  storage: MemoryStorage;
}) {
  const storageKey = `documents/product/${productId}/job-part-book.pdf`;
  await storage.put({
    body: pdfBytes(),
    byteSize: pdfBytes().byteLength,
    contentType: 'application/pdf',
    key: storageKey,
  });
  const [document] = await db
    .insert(documents)
    .values({
      byteSize: pdfBytes().byteLength,
      contentType: 'application/pdf',
      filename: 'Job Part Book.pdf',
      jobId,
      ownerType: 'job',
      sourceProductId: productId,
      storageKey,
      uploaderUserId: 'test-user-id',
    })
    .returning({ id: documents.id });

  if (!document) {
    throw new Error('Document insert did not return a row');
  }

  return document;
}

async function createJobOwner(db: Db, productId: UUID) {
  const [customer] = await db
    .insert(customers)
    .values({
      companyName: 'Document HTTP Customer',
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
      status: 'accepted',
    })
    .returning({ id: quotes.id });
  if (!quote) throw new Error('Quote insert did not return a row');

  const [job] = await db
    .insert(jobs)
    .values({
      productId,
      productSerialNumber: 'DOC-HTTP260001',
      productSerialPrefix: 'DOC-HTTP',
      productSerialSequence: 1,
      productSerialYear: 26,
      quoteId: quote.id,
    })
    .returning({ id: jobs.id });
  if (!job) throw new Error('Job insert did not return a row');

  return job;
}

function pdfBytes(): Uint8Array {
  return Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0x00, 0xff, 0x10]);
}

class MemoryStorage implements StorageAdapter {
  readonly gets: string[] = [];
  readonly objects = new Map<string, { body: Uint8Array; byteSize: number; contentType: string }>();

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async get(key: string): Promise<StoredObject> {
    this.gets.push(key);
    const object = this.objects.get(key);

    if (!object) {
      throw new Error(`Storage object not found: ${key}`);
    }

    return {
      body: toAsyncBody(object.body),
      byteSize: object.byteSize,
      contentType: object.contentType,
    };
  }

  async put(input: StoragePutInput): Promise<void> {
    this.objects.set(input.key, {
      body: input.body,
      byteSize: input.byteSize,
      contentType: input.contentType,
    });
  }
}

async function* toAsyncBody(body: Uint8Array): AsyncIterable<Uint8Array> {
  yield body;
}
