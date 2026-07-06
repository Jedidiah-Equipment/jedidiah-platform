import { type Db, products } from '@pkg/db';
import type { ProductRange } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { expectIsoDatetime, mockSession } from '@/test/test-utils.js';

const test = createTester(({ db }) => ({ db }));

async function createRange(
  caller: AppRouterCaller,
  name: string,
  overrides: Partial<Parameters<AppRouterCaller['productRanges']['create']>[0]> = {},
): Promise<ProductRange> {
  return caller.productRanges.create({
    name,
    ...overrides,
  });
}

async function createProductForRange(db: Db, rangeId: string): Promise<string> {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      buildTimeDays: 14,
      modelCode: `RANGE-REMOVE-${crypto.randomUUID()}`,
      name: `Range Remove Product ${crypto.randomUUID()}`,
      rangeId,
    })
    .returning({ id: products.id });

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product.id;
}

async function createLegacyProductForRange(db: Db, rangeId: string): Promise<void> {
  await db.insert(products).values({
    basePrice: 1_000,
    buildTimeDays: 14,
    modelCode: `RANGE-LEGACY-${crypto.randomUUID()}`,
    name: `Range Legacy Product ${crypto.randomUUID()}`,
    rangeId,
    deletedAt: new Date(),
  });
}

describe('productRanges.create', () => {
  test('creates a Product Range with no image or logo', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createRange(caller, 'Lowbed');

    expect(created).toMatchObject({
      image: null,
      logo: null,
      name: 'Lowbed',
      displayOrder: 0,
    });
    expectIsoDatetime(created.createdAt);
    expectIsoDatetime(created.updatedAt);
  });

  test('assigns an incrementing displayOrder so new Ranges append to the end', async ({ context }) => {
    const caller = context.createCaller();
    const first = await createRange(caller, 'Lowbed');
    const second = await createRange(caller, 'Earthmoving');

    expect(first.displayOrder).toBe(0);
    expect(second.displayOrder).toBe(1);
  });

  test('rejects case-insensitive duplicate names', async ({ context }) => {
    const caller = context.createCaller();
    await createRange(caller, 'Earthmoving');

    await expect(createRange(caller, '  earthmoving  ')).rejects.toMatchObject({
      appCode: 'product_range.duplicate_name',
      code: 'CONFLICT',
    });
  });
});

describe('productRanges.update', () => {
  test('updates Product Range names without touching the image', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createRange(caller, 'Lowbed');

    const updated = await caller.productRanges.update({
      id: created.id,
      name: 'Lowbed Pro',
    });

    expect(updated).toMatchObject({
      id: created.id,
      image: null,
      name: 'Lowbed Pro',
    });
  });

  test('rejects case-insensitive duplicate renames', async ({ context }) => {
    const caller = context.createCaller();
    await createRange(caller, 'Lowbed');
    const earthmoving = await createRange(caller, 'Earthmoving');

    await expect(
      caller.productRanges.update({
        id: earthmoving.id,
        name: 'lowbed',
      }),
    ).rejects.toMatchObject({
      appCode: 'product_range.duplicate_name',
      code: 'CONFLICT',
    });
  });
});

describe('productRanges.list', () => {
  test('lists Product Ranges in displayOrder (creation order by default)', async ({ context }) => {
    const caller = context.createCaller();
    await createRange(caller, 'Earthmoving');
    await createRange(caller, 'Balers');

    await expect(caller.productRanges.list()).resolves.toMatchObject({
      ranges: [{ name: 'Earthmoving' }, { name: 'Balers' }],
    });
  });
});

describe('productRanges.reorder', () => {
  test('rewrites displayOrder to match the supplied id order', async ({ context }) => {
    const caller = context.createCaller();
    const earthmoving = await createRange(caller, 'Earthmoving');
    const balers = await createRange(caller, 'Balers');
    const lowbed = await createRange(caller, 'Lowbed');

    const result = await caller.productRanges.reorder({
      orderedIds: [lowbed.id, earthmoving.id, balers.id],
    });

    expect(result.ranges.map((range) => range.name)).toEqual(['Lowbed', 'Earthmoving', 'Balers']);
    expect(result.ranges.map((range) => range.displayOrder)).toEqual([0, 1, 2]);
  });

  test('rejects an order that does not cover every Range', async ({ context }) => {
    const caller = context.createCaller();
    const earthmoving = await createRange(caller, 'Earthmoving');
    await createRange(caller, 'Balers');

    await expect(caller.productRanges.reorder({ orderedIds: [earthmoving.id] })).rejects.toBeDefined();
  });

  test('rejects an unknown Range id', async ({ context }) => {
    const caller = context.createCaller();
    const earthmoving = await createRange(caller, 'Earthmoving');

    await expect(
      caller.productRanges.reorder({ orderedIds: [earthmoving.id, '00000000-0000-4000-8000-0000000000ff'] }),
    ).rejects.toMatchObject({ appCode: 'product_range.not_found' });
  });

  test('reorders active Ranges only and rejects removed Range ids', async ({ context }) => {
    const caller = context.createCaller();
    const first = await createRange(caller, 'Active First');
    const removed = await createRange(caller, 'Removed From Order');
    const second = await createRange(caller, 'Active Second');

    await caller.productRanges.remove({ id: removed.id });

    const result = await caller.productRanges.reorder({ orderedIds: [second.id, first.id] });
    expect(result.ranges.map((range) => range.id)).toEqual([second.id, first.id]);

    await expect(caller.productRanges.reorder({ orderedIds: [second.id, removed.id, first.id] })).rejects.toMatchObject(
      { appCode: 'product_range.not_found' },
    );
  });
});

describe('productRanges.remove', () => {
  test('soft-removes an unlinked Product Range and hides it from active reads', async ({ context }) => {
    const caller = context.createCaller();
    const kept = await createRange(caller, 'Kept Range');
    const removed = await createRange(caller, 'Removed Range');

    await expect(caller.productRanges.remove({ id: removed.id })).resolves.toBeUndefined();

    await expect(caller.productRanges.get({ id: removed.id })).rejects.toMatchObject({
      appCode: 'product_range.not_found',
      code: 'NOT_FOUND',
    });
    await expect(caller.productRanges.list()).resolves.toMatchObject({
      ranges: [{ id: kept.id, name: 'Kept Range' }],
    });
  });

  test('returns not found for a missing or already deleted Product Range', async ({ context }) => {
    const caller = context.createCaller();
    const removed = await createRange(caller, 'Already Removed Range');

    await caller.productRanges.remove({ id: removed.id });

    await expect(caller.productRanges.remove({ id: removed.id })).rejects.toMatchObject({
      appCode: 'product_range.not_found',
      code: 'NOT_FOUND',
    });
    await expect(caller.productRanges.remove({ id: '00000000-0000-4000-8000-0000000000ff' })).rejects.toMatchObject({
      appCode: 'product_range.not_found',
      code: 'NOT_FOUND',
    });
  });

  test('rejects removing a Product Range with active linked products', async ({ context }) => {
    const caller = context.createCaller();
    const range = await createRange(caller, 'Linked Product Range');
    await createProductForRange(context.db, range.id);

    await expect(caller.productRanges.remove({ id: range.id })).rejects.toMatchObject({
      appCode: 'product_range.has_products',
      code: 'CONFLICT',
    });
  });

  test('allows removing a Product Range when only soft-removed products link to it', async ({ context }) => {
    const caller = context.createCaller();
    const range = await createRange(caller, 'Legacy Product Range');
    await createLegacyProductForRange(context.db, range.id);

    await expect(caller.productRanges.remove({ id: range.id })).resolves.toBeUndefined();
  });
});

describe('productRanges permissions', () => {
  test('requires authentication', async ({ context }) => {
    await expect(context.createAnonCaller().productRanges.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      context.createAnonCaller().productRanges.remove({ id: '00000000-0000-4000-8000-000000000001' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  test('denies sales, procurement-manager, and job-viewer on read/create/update/remove', async ({ context }) => {
    const adminCaller = context.createCaller();
    const range = await createRange(adminCaller, 'Permission Range');

    for (const role of ['sales', 'procurement-manager', 'job-viewer'] as const) {
      const caller = context.createCaller(mockSession(role));

      await expect(caller.productRanges.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(caller.productRanges.create({ name: `Denied ${role}` })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(
        caller.productRanges.update({
          id: range.id,
          name: `Denied ${role}`,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(caller.productRanges.remove({ id: range.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });
});
