import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { z } from 'zod';
import { createTester } from '@/test/create-tester.js';
import { createProductFixture } from '@/test/domain-fixtures.js';
import { createProductRangeFixture } from '@/test/product-range-fixtures.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { getProductDefinition, getProductTool } from './get-product.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  const rangeId = await createProductRangeFixture(db);

  return { db, rangeId };
});

describe('getProductTool', () => {
  test('returns the same product result shape as products.get', async ({ context }) => {
    const created = await createProductFixture(context.db, 'Compact Loader', context.rangeId);
    const access = createUserAccessSummary({
      role: 'procurement-manager',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      getProductTool.handler({ id: created.id }, createAiContext(context.db, access)),
      core.getProduct({ db: context.db, id: created.id }),
    ]);

    expect(toolResult).toEqual(trpcResult);
  });

  test('surfaces the core not-found message for missing products', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'procurement-manager',
      userId: 'test-user-id',
    });

    await expect(
      getProductTool.handler(
        {
          id: '00000000-0000-4000-8000-000000000001',
        },
        createAiContext(context.db, access),
      ),
    ).rejects.toThrow('Product not found: 00000000-0000-4000-8000-000000000001');
  });

  test('rejects invalid product get args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'procurement-manager',
      userId: 'test-user-id',
    });

    await expect(getProductTool.handler({ id: 'bad-id' }, createAiContext(context.db, access))).rejects.toBeInstanceOf(
      z.ZodError,
    );
  });

  test('projects Product metadata using public labels', () => {
    expect(
      (getProductDefinition.projectResult as (value: unknown) => unknown)({
        id: '00000000-0000-4000-8000-000000000006',
        name: 'Compact Loader',
      }),
    ).toMatchObject({
      links: [
        {
          entity: 'Product',
          href: '/products/00000000-0000-4000-8000-000000000006/edit',
          label: 'Compact Loader',
        },
      ],
    });
  });
});
