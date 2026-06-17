import { type Db, getUniqueViolationConstraint, productRanges } from '@pkg/db';
import type {
  ProductRange,
  ProductRangeCreateInput,
  ProductRangeListResult,
  ProductRangeOption,
  ProductRangeOptionsResult,
  ProductRangeUpdateInput,
  UUID,
} from '@pkg/schema';
import { ProductRangeOption as ProductRangeOptionSchema, ProductRange as ProductRangeSchema } from '@pkg/schema';
import { asc, eq, sql } from 'drizzle-orm';

import { DuplicateProductRangeNameError, ProductRangeNotFoundError } from './product-range-errors.js';

type ProductRangeRow = typeof productRanges.$inferSelect;
type ProductRangeOptionRow = Pick<ProductRangeRow, 'id' | 'name'>;

export function mapProductRange(row: ProductRangeRow): ProductRange {
  return ProductRangeSchema.parse({
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    imageDataUrl: row.imageDataUrl,
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
    orderBy: [asc(sql`lower(${productRanges.name})`), asc(productRanges.id)],
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
    .orderBy(asc(sql`lower(${productRanges.name})`), asc(productRanges.id));

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
    const [row] = await db.insert(productRanges).values(input).returning();

    if (!row) {
      throw new Error('Product Range insert did not return a row');
    }

    return mapProductRange(row);
  } catch (error) {
    throw mapProductRangeUniqueViolation(error, input);
  }
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
        imageDataUrl: input.imageDataUrl,
        name: input.name,
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
