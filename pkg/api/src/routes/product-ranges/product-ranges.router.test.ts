import { type Db, eq, productRangeVariants, products } from '@pkg/db';
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

async function createProductForRange(db: Db, rangeId: string, variantId?: string): Promise<string> {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      buildTimeDays: 14,
      modelCode: `RANGE-REMOVE-${crypto.randomUUID()}`,
      name: `Range Remove Product ${crypto.randomUUID()}`,
      rangeId,
      variantId,
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

  test('preserves Variants in the Product Range update response', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createRange(caller, 'Variant Update Range');
    const variant = await caller.productRanges.createVariant({ rangeId: created.id, name: 'Heavy Duty' });

    const updated = await caller.productRanges.update({
      id: created.id,
      name: 'Variant Update Range Pro',
    });

    expect(updated.variants).toEqual([
      expect.objectContaining({
        id: variant.id,
        name: 'Heavy Duty',
        rangeId: created.id,
      }),
    ]);
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

  test('includes active Variants in displayOrder', async ({ context }) => {
    const caller = context.createCaller();
    const range = await createRange(caller, 'Variant Range');
    const first = await caller.productRanges.createVariant({ rangeId: range.id, name: 'First' });
    const second = await caller.productRanges.createVariant({ rangeId: range.id, name: 'Second' });

    await caller.productRanges.reorderVariants({ rangeId: range.id, orderedIds: [second.id, first.id] });

    await expect(caller.productRanges.get({ id: range.id })).resolves.toMatchObject({
      variants: [
        { id: second.id, name: 'Second', displayOrder: 0 },
        { id: first.id, name: 'First', displayOrder: 1 },
      ],
    });
    await expect(caller.productRanges.list()).resolves.toMatchObject({
      ranges: [
        {
          id: range.id,
          variants: [
            { id: second.id, name: 'Second', displayOrder: 0 },
            { id: first.id, name: 'First', displayOrder: 1 },
          ],
        },
      ],
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

describe('productRanges Variants', () => {
  test('creates Variants at the end of the Range order', async ({ context }) => {
    const caller = context.createCaller();
    const range = await createRange(caller, 'Variant Create Range');

    const first = await caller.productRanges.createVariant({ rangeId: range.id, name: 'Heavy Duty' });
    const second = await caller.productRanges.createVariant({ rangeId: range.id, name: 'Compact' });

    expect(first).toMatchObject({ rangeId: range.id, name: 'Heavy Duty', displayOrder: 0 });
    expect(second).toMatchObject({ rangeId: range.id, name: 'Compact', displayOrder: 1 });
  });

  test('rejects empty and duplicate Variant names only within the same active Range', async ({ context }) => {
    const caller = context.createCaller();
    const firstRange = await createRange(caller, 'First Variant Range');
    const secondRange = await createRange(caller, 'Second Variant Range');

    await expect(caller.productRanges.createVariant({ rangeId: firstRange.id, name: '   ' })).rejects.toBeDefined();
    await caller.productRanges.createVariant({ rangeId: firstRange.id, name: 'Heavy Duty' });

    await expect(
      caller.productRanges.createVariant({ rangeId: firstRange.id, name: '  heavy duty  ' }),
    ).rejects.toMatchObject({
      appCode: 'product_range.variant_duplicate_name',
      code: 'CONFLICT',
    });

    await expect(
      caller.productRanges.createVariant({ rangeId: secondRange.id, name: 'heavy duty' }),
    ).resolves.toMatchObject({
      rangeId: secondRange.id,
      name: 'heavy duty',
    });
  });

  test('renames a Variant with the same uniqueness rules', async ({ context }) => {
    const caller = context.createCaller();
    const range = await createRange(caller, 'Variant Rename Range');
    const first = await caller.productRanges.createVariant({ rangeId: range.id, name: 'Heavy Duty' });
    const second = await caller.productRanges.createVariant({ rangeId: range.id, name: 'Compact' });

    await expect(
      caller.productRanges.updateVariant({ id: second.id, rangeId: range.id, name: 'heavy duty' }),
    ).rejects.toMatchObject({
      appCode: 'product_range.variant_duplicate_name',
      code: 'CONFLICT',
    });

    await expect(
      caller.productRanges.updateVariant({ id: first.id, rangeId: range.id, name: 'Wide Body' }),
    ).resolves.toMatchObject({
      id: first.id,
      name: 'Wide Body',
    });
  });

  test('soft-deletes a Variant and allows reusing its name', async ({ context }) => {
    const caller = context.createCaller();
    const range = await createRange(caller, 'Variant Remove Range');
    const kept = await caller.productRanges.createVariant({ rangeId: range.id, name: 'Kept' });
    const removed = await caller.productRanges.createVariant({ rangeId: range.id, name: 'Removed' });

    await expect(caller.productRanges.removeVariant({ id: removed.id, rangeId: range.id })).resolves.toBeUndefined();
    await expect(caller.productRanges.get({ id: range.id })).resolves.toMatchObject({
      variants: [{ id: kept.id, name: 'Kept' }],
    });
    await expect(caller.productRanges.createVariant({ rangeId: range.id, name: 'removed' })).resolves.toMatchObject({
      name: 'removed',
    });
  });

  test('blocks removing a Variant referenced by active Products and allows it after unlinking', async ({ context }) => {
    const caller = context.createCaller();
    const range = await createRange(caller, 'Variant Has Products Range');
    const variant = await caller.productRanges.createVariant({ rangeId: range.id, name: 'Linked' });
    const productId = await createProductForRange(context.db, range.id, variant.id);

    await expect(caller.productRanges.removeVariant({ id: variant.id, rangeId: range.id })).rejects.toMatchObject({
      appCode: 'product_range.variant_has_products',
      code: 'CONFLICT',
    });

    await context.db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, productId));

    await expect(caller.productRanges.removeVariant({ id: variant.id, rangeId: range.id })).resolves.toBeUndefined();
  });

  test('rewrites Variant displayOrder within one Range', async ({ context }) => {
    const caller = context.createCaller();
    const range = await createRange(caller, 'Variant Reorder Range');
    const otherRange = await createRange(caller, 'Other Variant Reorder Range');
    const first = await caller.productRanges.createVariant({ rangeId: range.id, name: 'First' });
    const second = await caller.productRanges.createVariant({ rangeId: range.id, name: 'Second' });
    const third = await caller.productRanges.createVariant({ rangeId: range.id, name: 'Third' });
    const other = await caller.productRanges.createVariant({ rangeId: otherRange.id, name: 'Other' });

    const result = await caller.productRanges.reorderVariants({
      rangeId: range.id,
      orderedIds: [third.id, first.id, second.id],
    });

    expect(result.variants.map((variant) => variant.name)).toEqual(['Third', 'First', 'Second']);
    expect(result.variants.map((variant) => variant.displayOrder)).toEqual([0, 1, 2]);

    await expect(
      caller.productRanges.reorderVariants({
        rangeId: range.id,
        orderedIds: [third.id, other.id, first.id, second.id],
      }),
    ).rejects.toMatchObject({
      appCode: 'product_range.variant_not_found',
    });
  });

  test('requires an active Range for Variant creation and reorder', async ({ context }) => {
    const caller = context.createCaller();
    const range = await createRange(caller, 'Removed Variant Parent Range');
    const variant = await caller.productRanges.createVariant({ rangeId: range.id, name: 'Before Removal' });

    await caller.productRanges.remove({ id: range.id });

    await expect(caller.productRanges.createVariant({ rangeId: range.id, name: 'Late Variant' })).rejects.toMatchObject(
      {
        appCode: 'product_range.not_found',
      },
    );
    await expect(caller.productRanges.reorderVariants({ rangeId: range.id, orderedIds: [] })).rejects.toMatchObject({
      appCode: 'product_range.not_found',
    });
    await expect(
      caller.productRanges.updateVariant({ id: variant.id, rangeId: range.id, name: 'After Removal' }),
    ).rejects.toMatchObject({
      appCode: 'product_range.not_found',
    });
    await expect(caller.productRanges.removeVariant({ id: variant.id, rangeId: range.id })).rejects.toMatchObject({
      appCode: 'product_range.not_found',
    });
  });

  test('persists soft deletion instead of deleting the row', async ({ context }) => {
    const caller = context.createCaller();
    const range = await createRange(caller, 'Variant Soft Delete Range');
    const variant = await caller.productRanges.createVariant({ rangeId: range.id, name: 'Soft Deleted' });

    await caller.productRanges.removeVariant({ id: variant.id, rangeId: range.id });

    const [row] = await context.db
      .select({ deletedAt: productRangeVariants.deletedAt })
      .from(productRangeVariants)
      .where(eq(productRangeVariants.id, variant.id));
    expect(row?.deletedAt).toBeInstanceOf(Date);
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
      await expect(
        caller.productRanges.createVariant({ rangeId: range.id, name: `Denied ${role}` }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(caller.productRanges.reorderVariants({ rangeId: range.id, orderedIds: [] })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    }
  });
});
