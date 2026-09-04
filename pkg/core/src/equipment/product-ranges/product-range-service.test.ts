import { productRanges } from '@pkg/db/equipment';
import { ProductRangeCreateInput, ProductRangeVariantCreateInput } from '@pkg/schema/equipment';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { createProductRange, removeProductRange } from './product-range-service.js';
import { createProductRangeVariant } from './product-range-variant-service.js';

const test = createTester(({ db }) => ({ db }));

async function createRange(db: Parameters<typeof createProductRange>[0]['db'], name: string) {
  return createProductRange({ db, input: ProductRangeCreateInput.parse({ name }) });
}

describe('createProductRange', () => {
  test('starts displayOrder at 0 when no Range exists', async ({ context }) => {
    const range = await createRange(context.db, 'First Range');

    expect(range.displayOrder).toBe(0);
  });

  test('appends each new Range one past the current maximum', async ({ context }) => {
    const first = await createRange(context.db, 'First Range');
    const second = await createRange(context.db, 'Second Range');
    const third = await createRange(context.db, 'Third Range');

    expect([first.displayOrder, second.displayOrder, third.displayOrder]).toEqual([0, 1, 2]);
  });

  test('ignores removed Ranges when computing the next slot', async ({ context }) => {
    const first = await createRange(context.db, 'First Range');
    const second = await createRange(context.db, 'Second Range');
    await removeProductRange({ db: context.db, id: second.id });

    const third = await createRange(context.db, 'Third Range');

    expect(third.displayOrder).toBe(first.displayOrder + 1);
  });
});

describe('createProductRangeVariant', () => {
  test('numbers Variants per Range, each starting at 0', async ({ context }) => {
    const [rangeA, rangeB] = [await createRange(context.db, 'Range A'), await createRange(context.db, 'Range B')];

    const firstOfA = await createProductRangeVariant({
      db: context.db,
      input: ProductRangeVariantCreateInput.parse({ name: 'Variant 1', rangeId: rangeA.id }),
    });
    const secondOfA = await createProductRangeVariant({
      db: context.db,
      input: ProductRangeVariantCreateInput.parse({ name: 'Variant 2', rangeId: rangeA.id }),
    });
    const firstOfB = await createProductRangeVariant({
      db: context.db,
      input: ProductRangeVariantCreateInput.parse({ name: 'Variant 1', rangeId: rangeB.id }),
    });

    expect([firstOfA.displayOrder, secondOfA.displayOrder]).toEqual([0, 1]);
    expect(firstOfB.displayOrder).toBe(0);
  });
});

describe('product range rows', () => {
  test('persists the computed displayOrder rather than a client value', async ({ context }) => {
    const range = await createRange(context.db, 'Persisted Range');
    const rows = await context.db
      .select({ displayOrder: productRanges.displayOrder })
      .from(productRanges)
      .where(eq(productRanges.id, range.id));

    expect(rows).toEqual([{ displayOrder: 0 }]);
  });
});
