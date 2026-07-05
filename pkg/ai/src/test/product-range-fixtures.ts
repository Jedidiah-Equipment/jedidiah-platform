import { type Db, productRanges, type StoredFile } from '@pkg/db';

export async function createProductRangeFixture(
  db: Db,
  name = `Test Range ${crypto.randomUUID()}`,
  image: StoredFile | null = null,
  logo: StoredFile | null = null,
): Promise<string> {
  const existing = await db.select({ id: productRanges.id }).from(productRanges);
  const displayOrder = existing.length;

  const [range] = await db
    .insert(productRanges)
    .values({ displayOrder, image, logo, name })
    .returning({ id: productRanges.id });

  if (!range) {
    throw new Error('Product Range insert did not return a row');
  }

  return range.id;
}
