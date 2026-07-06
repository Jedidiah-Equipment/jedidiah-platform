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

async function createProductForRange(db: Db, rangeId: string): Promise<void> {
  await db.insert(products).values({
    basePrice: 1_000,
    buildTimeDays: 14,
    modelCode: `RANGE-DELETE-${crypto.randomUUID()}`,
    name: `Range Delete Product ${crypto.randomUUID()}`,
    rangeId,
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
});

describe('productRanges.delete', () => {
  test('deletes an unlinked Product Range and hides it from lists', async ({ context }) => {
    const caller = context.createCaller();
    const kept = await createRange(caller, 'Kept Range');
    const deleted = await createRange(caller, 'Deleted Range');

    await expect(caller.productRanges.delete({ id: deleted.id })).resolves.toBeUndefined();

    await expect(caller.productRanges.get({ id: deleted.id })).rejects.toMatchObject({
      appCode: 'product_range.not_found',
      code: 'NOT_FOUND',
    });
    await expect(caller.productRanges.list()).resolves.toMatchObject({
      ranges: [{ id: kept.id, name: 'Kept Range' }],
    });
  });

  test('returns not found for a missing or already deleted Product Range', async ({ context }) => {
    const caller = context.createCaller();
    const deleted = await createRange(caller, 'Already Deleted Range');

    await caller.productRanges.delete({ id: deleted.id });

    await expect(caller.productRanges.delete({ id: deleted.id })).rejects.toMatchObject({
      appCode: 'product_range.not_found',
      code: 'NOT_FOUND',
    });
    await expect(caller.productRanges.delete({ id: '00000000-0000-4000-8000-0000000000ff' })).rejects.toMatchObject({
      appCode: 'product_range.not_found',
      code: 'NOT_FOUND',
    });
  });

  test('rejects deleting a Product Range with linked products', async ({ context }) => {
    const caller = context.createCaller();
    const range = await createRange(caller, 'Linked Product Range');
    await createProductForRange(context.db, range.id);

    await expect(caller.productRanges.delete({ id: range.id })).rejects.toMatchObject({
      appCode: 'product_range.has_products',
      code: 'CONFLICT',
    });
  });
});

describe('productRanges permissions', () => {
  test('requires authentication', async ({ context }) => {
    await expect(context.createAnonCaller().productRanges.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      context.createAnonCaller().productRanges.delete({ id: '00000000-0000-4000-8000-000000000001' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  test('denies sales, procurement-manager, and job-viewer on read/create/update/delete', async ({ context }) => {
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
      await expect(caller.productRanges.delete({ id: range.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });
});
