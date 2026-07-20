import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fastifyMultipart from '@fastify/multipart';
import type { StorageAdapter, StoragePutInput, StoredObject } from '@pkg/core';
import { type Db, products, user } from '@pkg/db';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { createProductRangeFixture } from '@/test/product-range-fixtures.js';
import { mockSession } from '@/test/test-utils.js';

import type { ProductImageRouteOptions } from './product-image-routes.js';

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

  return { db, product: await createProduct(db) };
});

const openApps: FastifyInstance[] = [];
const tempDirs: string[] = [];

beforeEach(() => {
  routeTestState.session = mockSession();
});

afterEach(async () => {
  await Promise.all([
    ...openApps.splice(0).map((app) => app.close()),
    ...tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  ]);
});

describe('product brochure image HTTP routes', () => {
  test('uploads an image into a slot and returns the updated product', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage);

    const response = await app.inject({
      method: 'POST',
      url: `/api/products/${context.product.id}/images/primary`,
      ...buildMultipartUpload({ bytes: pngBytes(64), filename: 'primary.png' }),
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      images: { primary: { byteSize: 64, contentType: 'image/png' } },
      id: context.product.id,
    });
    expect(storage.objects.size).toBe(1);
  });

  test('replaces a slot in place across uploads', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage);

    await app.inject({
      method: 'POST',
      url: `/api/products/${context.product.id}/images/primary`,
      ...buildMultipartUpload({ bytes: pngBytes(64), filename: 'primary.png' }),
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/products/${context.product.id}/images/primary`,
      ...buildMultipartUpload({ bytes: jpegBytes(96), filename: 'primary.jpg' }),
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      images: { primary: { byteSize: 96, contentType: 'image/jpeg' } },
    });
    expect(storage.objects.size).toBe(1);
  });

  test('rejects a non PNG/JPEG upload with a clear message and stores nothing', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage);

    const response = await app.inject({
      method: 'POST',
      url: `/api/products/${context.product.id}/images/primary`,
      ...buildMultipartUpload({ bytes: pdfBytes(), filename: 'spec.pdf' }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      data: { appCode: 'file.content_type_not_allowed' },
      message: 'Only PNG or JPEG files can be uploaded.',
    });
    expect(storage.objects.size).toBe(0);
  });

  test('rejects an unknown slot', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage);

    const response = await app.inject({
      method: 'POST',
      url: `/api/products/${context.product.id}/images/gallery`,
      ...buildMultipartUpload({ bytes: pngBytes(), filename: 'gallery.png' }),
    });

    expect(response.statusCode).toBe(400);
    expect(storage.objects.size).toBe(0);
  });

  test('authorizes brochure image writes before reading multipart content', async ({ context }) => {
    routeTestState.session = mockSession('sales');
    const app = await createApp(new MemoryStorage());

    const response = await app.inject({
      method: 'POST',
      url: `/api/products/${context.product.id}/images/primary`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      data: { appCode: 'file.forbidden' },
      message: 'You do not have permission to update Product images.',
    });
  });

  test('downloads a populated slot with read access', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage);
    await app.inject({
      method: 'POST',
      url: `/api/products/${context.product.id}/images/banner`,
      ...buildMultipartUpload({ bytes: pngBytes(48), filename: 'banner.png' }),
    });

    const response = await app.inject(`/api/products/${context.product.id}/images/banner/download`);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['content-length']).toBe('48');
  });

  test('downloads an optimized WebP mobile variant for a raster image', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage, { cacheDir: await createCacheDir() });
    await uploadPrimaryImage(app, context.product.id, validPngBytes());

    const response = await app.inject(`/api/products/${context.product.id}/images/primary/download?variant=mobile`);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['content-type']).toBe('image/webp');
    expect(response.rawPayload.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(response.rawPayload.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  test('falls back to original bytes when a mobile variant cannot be optimized', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage, { cacheDir: await createCacheDir() });
    const original = pngBytes(48);
    await uploadPrimaryImage(app, context.product.id, original);

    const response = await app.inject(`/api/products/${context.product.id}/images/primary/download?variant=mobile`);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.rawPayload).toEqual(Buffer.from(original));
  });

  test('serves a repeated mobile variant from disk without reading object storage again', async ({ context }) => {
    const storage = new MemoryStorage();
    const optimized = Buffer.from('RIFFxxxxWEBPoptimized-mobile-image', 'ascii');
    const optimize = vi.fn(async () => optimized);
    const app = await createApp(storage, { cacheDir: await createCacheDir(), optimize });
    await uploadPrimaryImage(app, context.product.id, validPngBytes());
    const url = `/api/products/${context.product.id}/images/primary/download?variant=mobile`;

    const first = await app.inject(url);
    const second = await app.inject(url);

    expect(first.rawPayload).toEqual(optimized);
    expect(second.rawPayload).toEqual(optimized);
    expect(optimize).toHaveBeenCalledTimes(1);
    expect(storage.getCalls).toBe(1);
  });

  test('requires authentication for mobile variants', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage, { cacheDir: await createCacheDir() });
    await uploadPrimaryImage(app, context.product.id, validPngBytes());
    routeTestState.session = null;

    const response = await app.inject(`/api/products/${context.product.id}/images/primary/download?variant=mobile`);

    expect(response.statusCode).toBe(401);
    expect(storage.getCalls).toBe(0);
  });

  test('requires Product read permission for mobile variants', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage, { cacheDir: await createCacheDir() });
    await uploadPrimaryImage(app, context.product.id, validPngBytes());
    routeTestState.session = mockSession('job-viewer');

    const response = await app.inject(`/api/products/${context.product.id}/images/primary/download?variant=mobile`);

    expect(response.statusCode).toBe(403);
    expect(storage.getCalls).toBe(0);
  });

  test('returns 404 when downloading an empty slot', async ({ context }) => {
    const app = await createApp(new MemoryStorage());

    const response = await app.inject(`/api/products/${context.product.id}/images/primary/download`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ data: { appCode: 'file.not_found' } });
  });
});

async function createApp(storage: StorageAdapter, imageOptions?: ProductImageRouteOptions) {
  const { registerEntityFileRoutes } = await import('../files/entity-file-http.route.js');
  const { createProductImageRouteConfig } = await import('./product-image-routes.js');
  const app = Fastify();

  await app.register(fastifyMultipart);
  await registerEntityFileRoutes(app, [
    createProductImageRouteConfig(storage, imageOptions ?? { cacheDir: await createCacheDir() }),
  ]);
  await app.ready();
  openApps.push(app);

  return app;
}

async function createCacheDir(): Promise<string> {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'api-product-image-cache-test-'));
  tempDirs.push(cacheDir);
  return cacheDir;
}

async function uploadPrimaryImage(app: FastifyInstance, productId: string, bytes: Uint8Array): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/products/${productId}/images/primary`,
    ...buildMultipartUpload({ bytes, filename: 'primary.png' }),
  });

  expect(response.statusCode, response.body).toBe(200);
}

async function createProduct(db: Db) {
  const rangeId = await createProductRangeFixture(db);
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'BROCHURE-IMG-HTTP',
      name: 'Brochure Image HTTP Product',
      rangeId,
    })
    .returning({ id: products.id });

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
}

function pngBytes(totalLength = 32): Uint8Array {
  const bytes = new Uint8Array(totalLength);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return bytes;
}

function validPngBytes(): Uint8Array {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWPgUbLgUbJggFAACoYBmbnuU6QAAAAASUVORK5CYII=',
    'base64',
  );
}

function jpegBytes(totalLength = 24): Uint8Array {
  const bytes = new Uint8Array(totalLength);
  bytes.set([0xff, 0xd8, 0xff]);

  return bytes;
}

function pdfBytes(): Uint8Array {
  return Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
}

function buildMultipartUpload(input: { bytes: Uint8Array; filename: string }): {
  headers: Record<string, string>;
  payload: Buffer;
} {
  const boundary = `----jedidiahtest${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  const pushText = (text: string) => chunks.push(Buffer.from(text, 'utf8'));

  pushText(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${input.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  chunks.push(Buffer.from(input.bytes));
  pushText(`\r\n--${boundary}--\r\n`);

  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(chunks),
  };
}

class MemoryStorage implements StorageAdapter {
  readonly objects = new Map<string, { body: Uint8Array; byteSize: number; contentType: string }>();
  getCalls = 0;

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async get(key: string): Promise<StoredObject> {
    this.getCalls += 1;
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
