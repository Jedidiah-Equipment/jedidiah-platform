import { type Db, productRanges } from '@pkg/db';

export async function createProductRangeFixture(db: Db, name = `Test Range ${crypto.randomUUID()}`): Promise<string> {
  // Append to the end: the next slot is the current row count (fixtures create contiguous orders).
  const existing = await db.select({ id: productRanges.id }).from(productRanges);
  const displayOrder = existing.length;

  const [range] = await db.insert(productRanges).values({ displayOrder, name }).returning({ id: productRanges.id });

  if (!range) {
    throw new Error('Product Range insert did not return a row');
  }

  return range.id;
}
