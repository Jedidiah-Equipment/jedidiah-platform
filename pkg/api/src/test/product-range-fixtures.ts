import { type Db, productRanges, type StoredImageRef } from '@pkg/db';

export async function createProductRangeFixture(
  db: Db,
  name = `Test Range ${crypto.randomUUID()}`,
  image: StoredImageRef | null = null,
): Promise<string> {
  const [range] = await db.insert(productRanges).values({ image, name }).returning({ id: productRanges.id });

  if (!range) {
    throw new Error('Product Range insert did not return a row');
  }

  return range.id;
}
