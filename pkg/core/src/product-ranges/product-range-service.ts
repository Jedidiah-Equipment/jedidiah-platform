import { type Db, getUniqueViolationConstraint, productRanges } from '@pkg/db';
import type {
  ProductRange,
  ProductRangeCreateInput,
  ProductRangeListResult,
  ProductRangeOption,
  ProductRangeOptionsResult,
  ProductRangeReorderInput,
  ProductRangeUpdateInput,
  UUID,
} from '@pkg/schema';
import { ProductRangeOption as ProductRangeOptionSchema, ProductRange as ProductRangeSchema } from '@pkg/schema';
import { asc, eq, max } from 'drizzle-orm';

import { DuplicateProductRangeNameError, ProductRangeNotFoundError } from './product-range-errors.js';

type ProductRangeRow = typeof productRanges.$inferSelect;
type ProductRangeOptionRow = Pick<ProductRangeRow, 'id' | 'name'>;

export function mapProductRange(row: ProductRangeRow): ProductRange {
  return ProductRangeSchema.parse({
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    id: row.id,
    // Drop the internal storage key; the schema brands the remaining values on parse. A row that predates
    // the column (null) reads as no image.
    image: row.image
      ? { byteSize: row.image.byteSize, contentType: row.image.contentType, updatedAt: row.image.updatedAt }
      : null,
    logo: row.logo
      ? { byteSize: row.logo.byteSize, contentType: row.logo.contentType, updatedAt: row.logo.updatedAt }
      : null,
    displayOrder: row.displayOrder,
    name: row.name,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function mapProductRangeOption(row: ProductRangeOptionRow): ProductRangeOption {
  return ProductRangeOptionSchema.parse({
    id: row.id,
    name: row.name,
  });
}

export async function listProductRanges({ db }: { db: Db }): Promise<ProductRangeListResult> {
  const rows = await db.query.productRanges.findMany({
    orderBy: [asc(productRanges.displayOrder), asc(productRanges.id)],
  });

  return {
    ranges: rows.map(mapProductRange),
  };
}

export async function listProductRangeOptions({ db }: { db: Db }): Promise<ProductRangeOptionsResult> {
  const rows = await db
    .select({
      id: productRanges.id,
      name: productRanges.name,
    })
    .from(productRanges)
    .orderBy(asc(productRanges.displayOrder), asc(productRanges.id));

  return {
    ranges: rows.map(mapProductRangeOption),
  };
}

export async function createProductRange({
  db,
  input,
}: {
  db: Db;
  input: ProductRangeCreateInput;
}): Promise<ProductRange> {
  try {
    // New Ranges append to the end of the list. Compute the next slot from the current max; an empty
    // table starts at 0.
    const [{ value: currentMax } = { value: null }] = await db
      .select({ value: max(productRanges.displayOrder) })
      .from(productRanges);
    const displayOrder = currentMax === null ? 0 : currentMax + 1;

    const [row] = await db
      .insert(productRanges)
      .values({ ...input, displayOrder })
      .returning();

    if (!row) {
      throw new Error('Product Range insert did not return a row');
    }

    return mapProductRange(row);
  } catch (error) {
    throw mapProductRangeUniqueViolation(error, input);
  }
}

// Rewrite each Range's displayOrder to its position in `orderedIds`. The payload must list every Range
// exactly once; a mismatch (missing or unknown id) is rejected so a stale client cannot silently drop a
// Range out of the ordering. Runs in a transaction so the list never observes a partial reorder.
export async function reorderProductRanges({
  db,
  input,
}: {
  db: Db;
  input: ProductRangeReorderInput;
}): Promise<ProductRangeListResult> {
  await db.transaction(async (tx) => {
    const rows = await tx.select({ id: productRanges.id }).from(productRanges);
    const existingIds = new Set(rows.map((row) => row.id));
    const orderedIds = input.orderedIds;

    const unknownId = orderedIds.find((id) => !existingIds.has(id));
    if (unknownId) {
      throw new ProductRangeNotFoundError(unknownId);
    }

    const sameSize = orderedIds.length === existingIds.size;
    const noDuplicates = new Set(orderedIds).size === orderedIds.length;
    if (!sameSize || !noDuplicates) {
      throw new Error('Reorder must list every Product Range exactly once');
    }

    await Promise.all(
      orderedIds.map((id, index) =>
        tx.update(productRanges).set({ displayOrder: index, updatedAt: new Date() }).where(eq(productRanges.id, id)),
      ),
    );
  });

  return listProductRanges({ db });
}

export async function updateProductRange({
  db,
  input,
}: {
  db: Db;
  input: ProductRangeUpdateInput;
}): Promise<ProductRange> {
  try {
    const [row] = await db
      .update(productRanges)
      .set({
        name: input.name,
        description: input.description,
        updatedAt: new Date(),
      })
      .where(eq(productRanges.id, input.id))
      .returning();

    if (!row) {
      throw new ProductRangeNotFoundError(input.id);
    }

    return mapProductRange(row);
  } catch (error) {
    throw mapProductRangeUniqueViolation(error, input);
  }
}

export async function getProductRange({ db, id }: { db: Db; id: UUID }): Promise<ProductRange> {
  const row = await db.query.productRanges.findFirst({
    where: eq(productRanges.id, id),
  });

  if (!row) {
    throw new ProductRangeNotFoundError(id);
  }

  return mapProductRange(row);
}

function mapProductRangeUniqueViolation(error: unknown, input: Pick<ProductRangeCreateInput, 'name'>): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (constraint !== null) {
    return new DuplicateProductRangeNameError(input.name);
  }

  return error instanceof Error ? error : new Error(String(error));
}
