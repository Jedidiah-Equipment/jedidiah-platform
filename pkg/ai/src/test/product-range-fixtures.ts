import { type Db, eq, productRanges, productRangeVariants, type StoredFile } from '@pkg/db';

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

export async function createProductRangeVariantFixture(
  db: Db,
  rangeId: string,
  name = `Test Variant ${crypto.randomUUID()}`,
): Promise<string> {
  const existing = await db
    .select({ id: productRangeVariants.id })
    .from(productRangeVariants)
    .where(eq(productRangeVariants.rangeId, rangeId));
  const displayOrder = existing.length;

  const [variant] = await db
    .insert(productRangeVariants)
    .values({ displayOrder, name, rangeId })
    .returning({ id: productRangeVariants.id });

  if (!variant) {
    throw new Error('Product Range Variant insert did not return a row');
  }

  return variant.id;
}
