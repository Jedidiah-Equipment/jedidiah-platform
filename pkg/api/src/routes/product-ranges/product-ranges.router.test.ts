import type { ProductRange } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { expectIsoDatetime, mockSession } from '@/test/test-utils.js';

const test = createTester();

const RANGE_IMAGE_DATA_URL = 'data:image/png;base64,aaaa';

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

describe('productRanges.create', () => {
  test('creates Product Ranges with nullable and present images', async ({ context }) => {
    const caller = context.createCaller();
    const withoutImage = await createRange(caller, 'Lowbed');
    const withImage = await createRange(caller, 'Earthmoving', { imageDataUrl: RANGE_IMAGE_DATA_URL });

    expect(withoutImage).toMatchObject({
      imageDataUrl: null,
      name: 'Lowbed',
    });
    expect(withImage).toMatchObject({
      imageDataUrl: RANGE_IMAGE_DATA_URL,
      name: 'Earthmoving',
    });
    expectIsoDatetime(withoutImage.createdAt);
    expectIsoDatetime(withoutImage.updatedAt);
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
  test('updates Product Range names and images', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createRange(caller, 'Lowbed');

    const updated = await caller.productRanges.update({
      id: created.id,
      imageDataUrl: RANGE_IMAGE_DATA_URL,
      name: 'Lowbed Pro',
    });

    expect(updated).toMatchObject({
      id: created.id,
      imageDataUrl: RANGE_IMAGE_DATA_URL,
      name: 'Lowbed Pro',
    });

    const withoutImage = await caller.productRanges.update({
      id: created.id,
      imageDataUrl: null,
      name: 'Lowbed Pro',
    });

    expect(withoutImage.imageDataUrl).toBeNull();
  });

  test('rejects case-insensitive duplicate renames', async ({ context }) => {
    const caller = context.createCaller();
    await createRange(caller, 'Lowbed');
    const earthmoving = await createRange(caller, 'Earthmoving');

    await expect(
      caller.productRanges.update({
        id: earthmoving.id,
        imageDataUrl: null,
        name: 'lowbed',
      }),
    ).rejects.toMatchObject({
      appCode: 'product_range.duplicate_name',
      code: 'CONFLICT',
    });
  });
});

describe('productRanges.list', () => {
  test('lists Product Ranges sorted by name', async ({ context }) => {
    const caller = context.createCaller();
    await createRange(caller, 'Earthmoving');
    await createRange(caller, 'Balers');

    await expect(caller.productRanges.list()).resolves.toMatchObject({
      ranges: [{ name: 'Balers' }, { name: 'Earthmoving' }],
    });
  });
});

describe('productRanges permissions', () => {
  test('requires authentication', async ({ context }) => {
    await expect(context.createAnonCaller().productRanges.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  test('denies sales, procurement-manager, and job-viewer on read/create/update', async ({ context }) => {
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
          imageDataUrl: null,
          name: `Denied ${role}`,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });
});
