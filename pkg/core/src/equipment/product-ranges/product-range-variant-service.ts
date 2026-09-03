import {
  type DatabaseTransaction,
  type Db,
  getUniqueViolationConstraint,
  notRemoved,
  productRanges,
  productRangeVariants,
  products,
} from '@pkg/db';
import type {
  ProductRangeVariant,
  ProductRangeVariantCreateInput,
  ProductRangeVariantReorderInput,
  ProductRangeVariantUpdateInput,
  UUID,
} from '@pkg/schema';
import { ProductRangeVariant as ProductRangeVariantSchema } from '@pkg/schema';
import { and, asc, eq, type SQL, sql } from 'drizzle-orm';

import {
  DuplicateProductRangeVariantNameError,
  ProductRangeNotFoundError,
  ProductRangeVariantHasProductsError,
  ProductRangeVariantNotFoundError,
} from './product-range-errors.js';

const PRODUCT_RANGE_VARIANT_NAME_UNIQUE_INDEX = 'product_range_variants_range_name_ci_unique';

type ProductRangeVariantRow = typeof productRangeVariants.$inferSelect;

export function mapProductRangeVariant(row: ProductRangeVariantRow): ProductRangeVariant {
  return ProductRangeVariantSchema.parse({
    createdAt: row.createdAt.toISOString(),
    displayOrder: row.displayOrder,
    id: row.id,
    name: row.name,
    rangeId: row.rangeId,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function createProductRangeVariant({
  db,
  input,
}: {
  db: Db;
  input: ProductRangeVariantCreateInput;
}): Promise<ProductRangeVariant> {
  try {
    return await db.transaction(async (tx) => {
      await assertActiveProductRange({ tx, rangeId: input.rangeId });

      // New Variants append to the end of their Range's list. The next slot is computed inside the
      // INSERT itself, so there is no read-modify-write for a concurrent create to interleave with; a
      // Range with no Variants starts at 0. The residual collision window is accepted for the same
      // reason as the Range sibling: creation is admin-only, and a reorder rewrites every position.
      const [row] = await tx
        .insert(productRangeVariants)
        .values({ ...input, displayOrder: nextProductRangeVariantDisplayOrder(input.rangeId) })
        .returning();

      if (!row) {
        throw new Error('Product Range Variant insert did not return a row');
      }

      return mapProductRangeVariant(row);
    });
  } catch (error) {
    throw mapProductRangeVariantUniqueViolation(error, input);
  }
}

export async function updateProductRangeVariant({
  db,
  input,
}: {
  db: Db;
  input: ProductRangeVariantUpdateInput;
}): Promise<ProductRangeVariant> {
  try {
    return await db.transaction(async (tx) => {
      await assertActiveProductRange({ tx, rangeId: input.rangeId });

      const [row] = await tx
        .update(productRangeVariants)
        .set({ name: input.name, updatedAt: new Date() })
        .where(
          and(
            eq(productRangeVariants.id, input.id),
            eq(productRangeVariants.rangeId, input.rangeId),
            notRemoved(productRangeVariants),
          ),
        )
        .returning();

      if (!row) {
        throw new ProductRangeVariantNotFoundError(input.rangeId, input.id);
      }

      return mapProductRangeVariant(row);
    });
  } catch (error) {
    throw mapProductRangeVariantUniqueViolation(error, input);
  }
}

export async function removeProductRangeVariant({
  db,
  id,
  rangeId,
}: {
  db: Db;
  id: UUID;
  rangeId: UUID;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await assertActiveProductRange({ tx, rangeId });
    await assertVariantHasNoActiveProducts({ tx, rangeId, id });

    const [row] = await tx
      .update(productRangeVariants)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(productRangeVariants.id, id),
          eq(productRangeVariants.rangeId, rangeId),
          notRemoved(productRangeVariants),
        ),
      )
      .returning({ id: productRangeVariants.id });

    if (!row) {
      throw new ProductRangeVariantNotFoundError(rangeId, id);
    }
  });
}

async function assertVariantHasNoActiveProducts({
  tx,
  rangeId,
  id,
}: {
  tx: DatabaseTransaction;
  rangeId: UUID;
  id: UUID;
}): Promise<void> {
  const [product] = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.rangeId, rangeId), eq(products.variantId, id), notRemoved(products)))
    .limit(1);

  if (product) {
    throw new ProductRangeVariantHasProductsError(rangeId, id);
  }
}

export async function reorderProductRangeVariants({
  db,
  input,
}: {
  db: Db;
  input: ProductRangeVariantReorderInput;
}): Promise<{ variants: ProductRangeVariant[] }> {
  await db.transaction(async (tx) => {
    await assertActiveProductRange({ tx, rangeId: input.rangeId });

    const rows = await tx
      .select({ id: productRangeVariants.id })
      .from(productRangeVariants)
      .where(and(eq(productRangeVariants.rangeId, input.rangeId), notRemoved(productRangeVariants)));
    const existingIds = new Set(rows.map((row) => row.id));
    const orderedIds = input.orderedIds;

    const unknownId = orderedIds.find((id) => !existingIds.has(id));
    if (unknownId) {
      throw new ProductRangeVariantNotFoundError(input.rangeId, unknownId);
    }

    const sameSize = orderedIds.length === existingIds.size;
    const noDuplicates = new Set(orderedIds).size === orderedIds.length;
    if (!sameSize || !noDuplicates) {
      throw new Error('Reorder must list every Product Range Variant in the Range exactly once');
    }

    await Promise.all(
      orderedIds.map((id, index) =>
        tx
          .update(productRangeVariants)
          .set({ displayOrder: index, updatedAt: new Date() })
          .where(and(eq(productRangeVariants.id, id), eq(productRangeVariants.rangeId, input.rangeId))),
      ),
    );
  });

  return listProductRangeVariants({ db, rangeId: input.rangeId });
}

export async function listProductRangeVariants({
  db,
  rangeId,
}: {
  db: Db;
  rangeId: UUID;
}): Promise<{ variants: ProductRangeVariant[] }> {
  const rows = await db
    .select()
    .from(productRangeVariants)
    .where(and(eq(productRangeVariants.rangeId, rangeId), notRemoved(productRangeVariants)))
    .orderBy(asc(productRangeVariants.displayOrder), asc(productRangeVariants.id));

  return { variants: rows.map(mapProductRangeVariant) };
}

// The append position as a scalar subquery, so the read and the write are one statement. The inner
// table carries an explicit alias: without it the reference is ambiguous against the INSERT target.
function nextProductRangeVariantDisplayOrder(rangeId: UUID): SQL<number> {
  const variant = sql.raw('"next_display_order_variant"');

  return sql<number>`(
  select coalesce(max(${variant}."display_order") + 1, 0)
  from ${productRangeVariants} ${variant}
  where ${variant}."range_id" = ${rangeId} and ${variant}."deleted_at" is null
)`;
}

async function assertActiveProductRange({ tx, rangeId }: { tx: DatabaseTransaction; rangeId: UUID }): Promise<void> {
  const [row] = await tx
    .select({ id: productRanges.id })
    .from(productRanges)
    .where(and(eq(productRanges.id, rangeId), notRemoved(productRanges)))
    .for('update');

  if (!row) {
    throw new ProductRangeNotFoundError(rangeId);
  }
}

function mapProductRangeVariantUniqueViolation(
  error: unknown,
  input: Pick<ProductRangeVariantCreateInput, 'rangeId' | 'name'>,
): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (constraint === PRODUCT_RANGE_VARIANT_NAME_UNIQUE_INDEX) {
    return new DuplicateProductRangeVariantNameError(input.rangeId, input.name);
  }

  return error instanceof Error ? error : new Error(String(error));
}
