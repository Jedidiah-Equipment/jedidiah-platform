import fastifyMultipart from '@fastify/multipart';
import type { StorageAdapter, StoragePutInput, StoredObject } from '@pkg/core';
import { type Db, user } from '@pkg/db';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { createProductRangeFixture } from '@/test/product-range-fixtures.js';
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

  return { db, rangeId: await createProductRangeFixture(db) };
});

const openApps: FastifyInstance[] = [];

beforeEach(() => {
  routeTestState.session = mockSession();
});

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('product range image HTTP routes', () => {
  test('uploads the image and returns the updated range', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage);

    const response = await app.inject({
      method: 'POST',
      url: `/api/product-ranges/${context.rangeId}/image`,
      ...buildMultipartUpload({ bytes: pngBytes(64), filename: 'range.png' }),
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      id: context.rangeId,
      image: { byteSize: 64, contentType: 'image/png' },
    });
    expect(storage.objects.size).toBe(1);
  });

  test('replaces the image in place across uploads', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage);

    await app.inject({
      method: 'POST',
      url: `/api/product-ranges/${context.rangeId}/image`,
      ...buildMultipartUpload({ bytes: pngBytes(64), filename: 'range.png' }),
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/product-ranges/${context.rangeId}/image`,
      ...buildMultipartUpload({ bytes: jpegBytes(96), filename: 'range.jpg' }),
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ image: { byteSize: 96, contentType: 'image/jpeg' } });
    expect(storage.objects.size).toBe(1);
  });

  test('rejects a non PNG/JPEG upload with a clear message and stores nothing', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage);

    const response = await app.inject({
      method: 'POST',
      url: `/api/product-ranges/${context.rangeId}/image`,
      ...buildMultipartUpload({ bytes: pdfBytes(), filename: 'spec.pdf' }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      data: { appCode: 'image.content_type_not_allowed' },
      message: 'Only PNG or JPEG files can be uploaded.',
    });
    expect(storage.objects.size).toBe(0);
  });

  test('returns 404 when uploading to a missing range', async ({ context }) => {
    void context;
    const storage = new MemoryStorage();
    const app = await createApp(storage);

    const response = await app.inject({
      method: 'POST',
      url: `/api/product-ranges/00000000-0000-4000-8000-0000000009ff/image`,
      ...buildMultipartUpload({ bytes: pngBytes(), filename: 'range.png' }),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ data: { appCode: 'product_range.not_found' } });
    expect(storage.objects.size).toBe(0);
  });

  test('authorizes image writes before reading multipart content', async ({ context }) => {
    routeTestState.session = mockSession('sales');
    const app = await createApp(new MemoryStorage());

    const response = await app.inject({
      method: 'POST',
      url: `/api/product-ranges/${context.rangeId}/image`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      data: { appCode: 'image.forbidden' },
      message: 'You do not have permission to update Product Range images.',
    });
  });

  test('downloads a populated image with read access', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage);
    await app.inject({
      method: 'POST',
      url: `/api/product-ranges/${context.rangeId}/image`,
      ...buildMultipartUpload({ bytes: pngBytes(48), filename: 'range.png' }),
    });

    const response = await app.inject(`/api/product-ranges/${context.rangeId}/image/download`);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['content-length']).toBe('48');
  });

  test('returns 404 when downloading a range with no image', async ({ context }) => {
    const app = await createApp(new MemoryStorage());

    const response = await app.inject(`/api/product-ranges/${context.rangeId}/image/download`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ data: { appCode: 'image.not_found' } });
  });
});

describe('product range logo HTTP routes', () => {
  test('uploads the logo and returns the updated range', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage);

    const response = await app.inject({
      method: 'POST',
      url: `/api/product-ranges/${context.rangeId}/logo`,
      ...buildMultipartUpload({ bytes: pngBytes(64), filename: 'logo.png' }),
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      id: context.rangeId,
      logo: { byteSize: 64, contentType: 'image/png' },
      image: null,
    });
    expect(storage.objects.size).toBe(1);
  });

  test('replaces the logo in place across uploads', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage);

    await app.inject({
      method: 'POST',
      url: `/api/product-ranges/${context.rangeId}/logo`,
      ...buildMultipartUpload({ bytes: pngBytes(64), filename: 'logo.png' }),
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/product-ranges/${context.rangeId}/logo`,
      ...buildMultipartUpload({ bytes: jpegBytes(96), filename: 'logo.jpg' }),
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ logo: { byteSize: 96, contentType: 'image/jpeg' } });
    expect(storage.objects.size).toBe(1);
  });

  test('forbids logo writes without update permission', async ({ context }) => {
    routeTestState.session = mockSession('sales');
    const app = await createApp(new MemoryStorage());

    const response = await app.inject({
      method: 'POST',
      url: `/api/product-ranges/${context.rangeId}/logo`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      data: { appCode: 'image.forbidden' },
      message: 'You do not have permission to update Product Range logos.',
    });
  });

  test('downloads a populated logo with read access', async ({ context }) => {
    const storage = new MemoryStorage();
    const app = await createApp(storage);
    await app.inject({
      method: 'POST',
      url: `/api/product-ranges/${context.rangeId}/logo`,
      ...buildMultipartUpload({ bytes: pngBytes(48), filename: 'logo.png' }),
    });

    const response = await app.inject(`/api/product-ranges/${context.rangeId}/logo/download`);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['content-length']).toBe('48');
  });

  test('returns 404 when downloading a range with no logo', async ({ context }) => {
    const app = await createApp(new MemoryStorage());

    const response = await app.inject(`/api/product-ranges/${context.rangeId}/logo/download`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ data: { appCode: 'image.not_found' } });
  });
});

async function createApp(storage: StorageAdapter) {
  const { registerEntityImageRoutes } = await import('../images/entity-image-http.route.js');
  const { createProductRangeImageRouteConfig, createProductRangeLogoRouteConfig } = await import(
    './product-range-image-routes.js'
  );
  const app = Fastify();

  await app.register(fastifyMultipart);
  await registerEntityImageRoutes(app, [
    createProductRangeImageRouteConfig(storage),
    createProductRangeLogoRouteConfig(storage),
  ]);
  await app.ready();
  openApps.push(app);

  return app;
}

function pngBytes(totalLength = 32): Uint8Array {
  const bytes = new Uint8Array(totalLength);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return bytes;
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

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async get(key: string): Promise<StoredObject> {
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
