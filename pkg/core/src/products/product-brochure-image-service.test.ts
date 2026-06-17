import { auditEvents, products, user } from '@pkg/db';
import { BROCHURE_IMAGE_MAX_BYTES } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { ImageNotFoundError, ImagePolicyViolationError } from '../images/image-errors.js';
import { createTester } from '../test/create-tester.js';
import { InMemoryStorageAdapter } from '../test/in-memory-storage-adapter.js';
import { readProductBrochureImage, replaceProductBrochureImage } from './product-brochure-image-service.js';
import { ProductNotFoundError } from './product-errors.js';

const ACTOR_USER_ID = 'test-user-id';
const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111';

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
      modelCode: 'BROCHURE-IMG',
      name: 'Brochure Image Product',
    })
    .returning({ id: products.id });

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return { db, product };
});

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
  return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
}

describe('replaceProductBrochureImage', () => {
  test('uploads an image into a slot and exposes it on the product', async ({ context }) => {
    const storage = new InMemoryStorageAdapter();

    const product = await replaceProductBrochureImage({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: { bytes: pngBytes(64), productId: context.product.id, slot: 'hero' },
      storage,
    });

    expect(product.brochureConfig.images.hero).toMatchObject({ byteSize: 64, contentType: 'image/png' });
    expect(product.brochureConfig.images.rangeLogo).toBeNull();
    expect(storage.objects.size).toBe(1);

    const [row] = await context.db
      .select({ brochureImages: products.brochureImages })
      .from(products)
      .where(eq(products.id, context.product.id));
    const storageKey = row?.brochureImages.hero?.storageKey;
    expect(storageKey).toMatch(new RegExp(`^brochure-images/product/${context.product.id}/hero/`));
    expect(storage.objects.has(storageKey ?? '')).toBe(true);
  });

  test('replaces a slot in place, keeping exactly one current object and deleting the old one', async ({ context }) => {
    const storage = new InMemoryStorageAdapter();

    const first = await replaceProductBrochureImage({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: { bytes: pngBytes(64), productId: context.product.id, slot: 'hero' },
      storage,
    });
    const firstUpdatedAt = first.brochureConfig.images.hero?.updatedAt;

    const second = await replaceProductBrochureImage({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: { bytes: jpegBytes(128), productId: context.product.id, slot: 'hero' },
      storage,
    });

    expect(second.brochureConfig.images.hero).toMatchObject({ byteSize: 128, contentType: 'image/jpeg' });
    // Replace-in-place keeps a single stored object for the slot.
    expect(storage.objects.size).toBe(1);
    expect(second.brochureConfig.images.hero?.updatedAt).not.toBe(firstUpdatedAt);
  });

  test('keeps slots independent', async ({ context }) => {
    const storage = new InMemoryStorageAdapter();

    await replaceProductBrochureImage({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: { bytes: pngBytes(), productId: context.product.id, slot: 'hero' },
      storage,
    });
    const product = await replaceProductBrochureImage({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: { bytes: jpegBytes(), productId: context.product.id, slot: 'rangeLogo' },
      storage,
    });

    expect(product.brochureConfig.images.hero).toMatchObject({ contentType: 'image/png' });
    expect(product.brochureConfig.images.rangeLogo).toMatchObject({ contentType: 'image/jpeg' });
    expect(storage.objects.size).toBe(2);
  });

  test('records each replacement as a product audit change-of-fact', async ({ context }) => {
    const storage = new InMemoryStorageAdapter();

    await replaceProductBrochureImage({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: { bytes: pngBytes(), productId: context.product.id, slot: 'technicalDrawing' },
      storage,
    });

    const events = await context.db.select().from(auditEvents).where(eq(auditEvents.entityId, context.product.id));
    const updateEvent = events.find((event) => event.action === 'updated');

    expect(updateEvent).toBeDefined();
    expect(updateEvent?.entityType).toBe('product');
    const changes = updateEvent?.changes as Record<string, { from: unknown; to: unknown }> | null;
    expect(changes?.['brochureImage:technicalDrawing']).toMatchObject({ from: null });
    expect(typeof changes?.['brochureImage:technicalDrawing']?.to).toBe('string');
  });

  test('rejects a non PNG/JPEG upload and stores nothing', async ({ context }) => {
    const storage = new InMemoryStorageAdapter();

    await expect(
      replaceProductBrochureImage({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: { bytes: pdfBytes(), productId: context.product.id, slot: 'hero' },
        storage,
      }),
    ).rejects.toBeInstanceOf(ImagePolicyViolationError);
    expect(storage.objects.size).toBe(0);
  });

  test('rejects an upload over the size cap and stores nothing', async ({ context }) => {
    const storage = new InMemoryStorageAdapter();

    await expect(
      replaceProductBrochureImage({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: { bytes: pngBytes(BROCHURE_IMAGE_MAX_BYTES + 1), productId: context.product.id, slot: 'hero' },
        storage,
      }),
    ).rejects.toMatchObject({ code: 'image.file_too_large' });
    expect(storage.objects.size).toBe(0);
  });

  test('throws when the product does not exist and cleans up the uploaded object', async ({ context }) => {
    const storage = new InMemoryStorageAdapter();

    await expect(
      replaceProductBrochureImage({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: { bytes: pngBytes(), productId: UNKNOWN_ID, slot: 'hero' },
        storage,
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(storage.objects.size).toBe(0);
  });
});

describe('readProductBrochureImage', () => {
  test('returns the stored object for a populated slot', async ({ context }) => {
    const storage = new InMemoryStorageAdapter();
    await replaceProductBrochureImage({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: { bytes: pngBytes(48), productId: context.product.id, slot: 'secondary' },
      storage,
    });

    const object = await readProductBrochureImage({
      db: context.db,
      productId: context.product.id,
      slot: 'secondary',
      storage,
    });

    expect(object.contentType).toBe('image/png');
    expect(object.byteSize).toBe(48);
  });

  test('throws when the slot is empty', async ({ context }) => {
    const storage = new InMemoryStorageAdapter();

    await expect(
      readProductBrochureImage({ db: context.db, productId: context.product.id, slot: 'hero', storage }),
    ).rejects.toBeInstanceOf(ImageNotFoundError);
  });

  test('throws when the product does not exist', async ({ context }) => {
    const storage = new InMemoryStorageAdapter();

    await expect(
      readProductBrochureImage({ db: context.db, productId: UNKNOWN_ID, slot: 'hero', storage }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});
