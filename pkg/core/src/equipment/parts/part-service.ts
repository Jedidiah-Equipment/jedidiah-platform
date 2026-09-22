import {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  type DatabaseTransaction,
  type Db,
  getSortOrder,
  getUniqueViolationConstraint,
  withPagination,
} from '@pkg/db';
import {
  partBom,
  partCategories,
  parts,
  purchaseOrderLines,
  purchaseOrders,
  stockMovements,
  supplier,
} from '@pkg/db/equipment';
import type { AuthId, UUID } from '@pkg/schema';
import { getNextCursor } from '@pkg/schema';
import type {
  Part,
  PartCategoryListResult,
  PartCreateInput,
  PartListInput,
  PartListResult,
  PartStorageLocationListResult,
  PartUpdateInput,
} from '@pkg/schema/equipment';
import { Part as PartSchema } from '@pkg/schema/equipment';
import { and, asc, count, eq, isNotNull, isNull, ne, or, type SQL, sql } from 'drizzle-orm';

import { defineAuditDescriptor, recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import {
  DuplicatePartCodeError,
  PartBomLockedError,
  PartCategoryNotFoundError,
  PartNotFoundError,
  PartSupplierLockedByPurchaseOrderError,
  PartSupplierNotFoundError,
  PartUnitOfMeasureLockedError,
} from './part-errors.js';

type PartRow = typeof parts.$inferSelect;
type SupplierRow = Pick<typeof supplier.$inferSelect, 'companyName' | 'id'>;
const unitOfMeasureLockedSql = sql<boolean>`exists(
  select 1 from ${stockMovements}
  where ${stockMovements.partId} = ${parts.id}
)`;

export const partAuditDescriptor = defineAuditDescriptor<PartRow>({
  entityType: 'part',
  noun: 'part',
  primaryLabelField: 'name',
  entityId: (row) => row.id,
  toRecord: (row) => ({
    averageUtilizationPercent: row.averageUtilizationPercent,
    categoryId: row.categoryId,
    code: row.code,
    description: row.description,
    drawingCode: row.drawingCode,
    finish: row.finish,
    isInternallyFabricated: row.isInternallyFabricated,
    minimumStock: row.minimumStock,
    name: row.name,
    standardPurchaseLengthMm: row.standardPurchaseLengthMm,
    stockTrackingMode: row.stockTrackingMode,
    storageLocation: row.storageLocation,
    supplierCode: row.supplierCode,
    supplierId: row.supplierId,
    unitOfMeasure: row.unitOfMeasure,
  }),
});

type PartWithSupplierRow = PartRow & {
  categoryName: string;
  /** Null on a Built Part, which is made in-house and bought from nobody. */
  supplier: SupplierRow | null;
  unitOfMeasureLocked: boolean;
};

export function mapPart(row: PartWithSupplierRow): Part {
  return PartSchema.parse({
    averageUtilizationPercent: row.averageUtilizationPercent,
    category: row.categoryName,
    categoryId: row.categoryId,
    code: row.code,
    description: row.description,
    drawingCode: row.drawingCode,
    finish: row.finish,
    id: row.id,
    isInternallyFabricated: row.isInternallyFabricated,
    minimumStock: row.minimumStock,
    name: row.name,
    standardPurchaseLengthMm: row.standardPurchaseLengthMm,
    stockTrackingMode: row.stockTrackingMode,
    storageLocation: row.storageLocation,
    supplier: row.supplier,
    supplierCode: row.supplierCode,
    supplierId: row.supplierId,
    unitOfMeasure: row.unitOfMeasure,
    unitOfMeasureLocked: row.unitOfMeasureLocked,
  });
}

export async function listParts({ db, input }: { db: Db; input: PartListInput }): Promise<PartListResult> {
  const sortColumn = getPartSortColumn(input.sortBy);
  const orderBy = getSortOrder(sortColumn, input.sortDirection);
  const where = buildPartListWhere(input);
  const rowsQuery = withPagination(
    db
      .select({
        categoryName: partCategories.name,
        part: parts,
        supplier: {
          id: supplier.id,
          companyName: supplier.companyName,
        },
        unitOfMeasureLocked: unitOfMeasureLockedSql,
      })
      .from(parts)
      .innerJoin(partCategories, eq(parts.categoryId, partCategories.id))
      .leftJoin(supplier, eq(parts.supplierId, supplier.id))
      .where(where)
      .orderBy(orderBy, asc(parts.id))
      .$dynamic(),
    input,
  );
  const totalQuery = db
    .select({ value: count() })
    .from(parts)
    .innerJoin(partCategories, eq(parts.categoryId, partCategories.id))
    .leftJoin(supplier, eq(parts.supplierId, supplier.id))
    .where(where);
  const [rows, totalRows] = await Promise.all([rowsQuery, totalQuery]);
  const total = totalRows[0]?.value ?? 0;
  const items = rows.map((row) =>
    mapPart({
      ...row.part,
      categoryName: row.categoryName,
      supplier: row.supplier,
      unitOfMeasureLocked: row.unitOfMeasureLocked,
    }),
  );

  return {
    items,
    nextCursor: getNextCursor({ count: items.length, cursor: input.cursor, total }),
    total,
  };
}

export async function listPartCategories({ db }: { db: Db }): Promise<PartCategoryListResult> {
  const categories = await db
    .select({ id: partCategories.id, name: partCategories.name })
    .from(partCategories)
    .orderBy(asc(sql`lower(${partCategories.name})`), asc(partCategories.id));

  return { categories };
}

export async function listPartStorageLocations({ db }: { db: Db }): Promise<PartStorageLocationListResult> {
  const rows = await db
    .selectDistinct({ location: parts.storageLocation })
    .from(parts)
    .where(isNotNull(parts.storageLocation))
    .orderBy(asc(parts.storageLocation));

  return {
    locations: rows.flatMap((row) => (row.location === null ? [] : [row.location])),
  };
}

function buildPartListWhere(input: PartListInput): SQL | undefined {
  const conditions: SQL[] = [isNull(supplier.deletedAt)];

  if (input.search) {
    const globalSearchWhere = or(
      createGlobalSearchCondition(input.search, [
        sql`${partCategories.name}`,
        sql`${parts.code}`,
        sql`${parts.description}`,
        sql`${parts.drawingCode}`,
        sql`${parts.finish}`,
        sql`${parts.name}`,
        sql`${parts.storageLocation}`,
        sql`${parts.supplierCode}`,
        sql`${parts.id}::text`,
      ]),
      createEscapedContainsSearchCondition(sql`${supplier.companyName}`, input.search),
    );

    if (globalSearchWhere) {
      conditions.push(globalSearchWhere);
    }
  }

  if (input.categoryId) {
    conditions.push(eq(parts.categoryId, input.categoryId));
  }

  if (input.supplierId) {
    conditions.push(eq(parts.supplierId, input.supplierId));
  }

  if (input.columnFilters.category) {
    conditions.push(createEscapedContainsSearchCondition(sql`${partCategories.name}`, input.columnFilters.category));
  }

  if (input.columnFilters.code) {
    conditions.push(createEscapedContainsSearchCondition(sql`${parts.code}`, input.columnFilters.code));
  }

  if (input.columnFilters.id) {
    conditions.push(createEscapedContainsSearchCondition(sql`${parts.id}::text`, input.columnFilters.id));
  }

  if (input.columnFilters.isInternallyFabricated !== undefined) {
    conditions.push(eq(parts.isInternallyFabricated, input.columnFilters.isInternallyFabricated));
  }

  if (input.columnFilters.name) {
    conditions.push(createEscapedContainsSearchCondition(sql`${parts.name}`, input.columnFilters.name));
  }

  if (input.columnFilters.storageLocation) {
    conditions.push(eq(parts.storageLocation, input.columnFilters.storageLocation));
  }

  if (input.columnFilters.supplierCode) {
    conditions.push(createEscapedContainsSearchCondition(sql`${parts.supplierCode}`, input.columnFilters.supplierCode));
  }

  if (input.columnFilters.supplierName) {
    conditions.push(
      createEscapedContainsSearchCondition(sql`${supplier.companyName}`, input.columnFilters.supplierName),
    );
  }

  if (input.columnFilters.unitOfMeasure) {
    conditions.push(eq(parts.unitOfMeasure, input.columnFilters.unitOfMeasure));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getPart({ db, id }: { db: Db | DatabaseTransaction; id: UUID }): Promise<Part> {
  const [row] = await db
    .select({
      categoryName: partCategories.name,
      part: parts,
      supplier: {
        companyName: supplier.companyName,
        id: supplier.id,
      },
      unitOfMeasureLocked: unitOfMeasureLockedSql,
    })
    .from(parts)
    .innerJoin(partCategories, eq(parts.categoryId, partCategories.id))
    .leftJoin(supplier, eq(parts.supplierId, supplier.id))
    .where(eq(parts.id, id))
    .limit(1);

  if (!row) {
    throw new PartNotFoundError(id);
  }

  return mapPart({
    ...row.part,
    categoryName: row.categoryName,
    supplier: row.supplier,
    unitOfMeasureLocked: row.unitOfMeasureLocked,
  });
}

export async function createPart({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PartCreateInput;
}): Promise<Part> {
  try {
    return await db.transaction(async (tx) => {
      await assertPartCategoryExists({ categoryId: input.categoryId, db: tx });
      await assertSupplierExists({ db: tx, supplierId: input.supplierId });

      const [row] = await tx.insert(parts).values(input).returning();

      if (!row) {
        throw new Error('Part insert did not return a row');
      }

      await recordAuditCreate({ db: tx, descriptor: partAuditDescriptor, actorUserId, input: row });

      return getPart({ db: tx, id: row.id });
    });
  } catch (error) {
    throw mapPartUniqueViolation(error, input);
  }
}

export async function updatePart({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PartUpdateInput;
}): Promise<Part> {
  try {
    return await mutateEntity({
      actorUserId,
      assert: async (tx, before) => {
        await assertPartCategoryExists({ categoryId: input.categoryId, db: tx });
        await assertSupplierExists({ db: tx, supplierId: input.supplierId });
        await assertSupplierMutable({ before, db: tx, nextSupplierId: input.supplierId });
        await assertBomCleared({ before, db: tx, nextIsInternallyFabricated: input.isInternallyFabricated });
        await assertUnitOfMeasureMutable({ before, db: tx, nextUnitOfMeasure: input.unitOfMeasure });
      },
      db,
      descriptor: partAuditDescriptor,
      id: input.id,
      notFound: () => new PartNotFoundError(input.id),
      project: (tx, row) => getPart({ db: tx, id: row.id }),
      // `parts` carries no timestamp columns, so there is no `updatedAt` to touch.
      set: () => ({
        averageUtilizationPercent: input.averageUtilizationPercent,
        categoryId: input.categoryId,
        code: input.code,
        description: input.description,
        drawingCode: input.drawingCode,
        finish: input.finish,
        isInternallyFabricated: input.isInternallyFabricated,
        minimumStock: input.minimumStock,
        name: input.name,
        standardPurchaseLengthMm: input.standardPurchaseLengthMm,
        stockTrackingMode: input.stockTrackingMode,
        storageLocation: input.storageLocation,
        supplierCode: input.supplierCode,
        supplierId: input.supplierId,
        unitOfMeasure: input.unitOfMeasure,
      }),
      table: parts,
    });
  } catch (error) {
    throw mapPartUniqueViolation(error, input);
  }
}

export async function assertUnitOfMeasureMutable({
  before,
  db,
  nextUnitOfMeasure,
}: {
  before: Pick<PartRow, 'id' | 'unitOfMeasure'>;
  db: DatabaseTransaction;
  nextUnitOfMeasure: PartRow['unitOfMeasure'];
}): Promise<void> {
  if (before.unitOfMeasure === nextUnitOfMeasure) {
    return;
  }

  const [movement] = await db
    .select({ id: stockMovements.id })
    .from(stockMovements)
    .where(eq(stockMovements.partId, before.id))
    .limit(1);

  if (movement) {
    throw new PartUnitOfMeasureLockedError(before.id);
  }
}

export async function assertSupplierMutable({
  before,
  db,
  nextSupplierId,
}: {
  before: Pick<PartRow, 'id' | 'supplierId'>;
  db: DatabaseTransaction;
  nextSupplierId: PartRow['supplierId'];
}): Promise<void> {
  if (before.supplierId === nextSupplierId) return;

  const [purchaseOrderLine] = await db
    .select({ partId: purchaseOrderLines.partId })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
    .where(and(eq(purchaseOrderLines.partId, before.id), ne(purchaseOrders.status, 'cancelled')))
    .limit(1);

  if (purchaseOrderLine) throw new PartSupplierLockedByPurchaseOrderError(before.id);
}

/**
 * The DB's XOR check sees the fabricated flag against `supplier_id`, but it cannot see `part_bom`.
 * Turning a built Part back into a bought one with components still stored would leave a Part
 * holding both, so the BOM has to be cleared first.
 */
async function assertBomCleared({
  before,
  db,
  nextIsInternallyFabricated,
}: {
  before: Pick<PartRow, 'id' | 'isInternallyFabricated'>;
  db: DatabaseTransaction;
  nextIsInternallyFabricated: boolean;
}): Promise<void> {
  if (nextIsInternallyFabricated || !before.isInternallyFabricated) return;

  const [line] = await db
    .select({ parentPartId: partBom.parentPartId })
    .from(partBom)
    .where(eq(partBom.parentPartId, before.id))
    .limit(1);

  if (line) throw new PartBomLockedError(before.id);
}

/** A Built Part names no Supplier, so there is nothing to check; the XOR rule is Zod's and the DB's. */
async function assertSupplierExists({
  db,
  supplierId,
}: {
  db: Db | DatabaseTransaction;
  supplierId: UUID | null;
}): Promise<void> {
  if (supplierId === null) return;

  const [row] = await db
    .select({ id: supplier.id })
    .from(supplier)
    .where(and(eq(supplier.id, supplierId), isNull(supplier.deletedAt)))
    .limit(1)
    // Pair with Supplier retirement so validation and the following Part write stay one unit.
    .for('share');

  if (!row) {
    throw new PartSupplierNotFoundError(supplierId);
  }
}

async function assertPartCategoryExists({
  categoryId,
  db,
}: {
  categoryId: UUID;
  db: Db | DatabaseTransaction;
}): Promise<void> {
  const [row] = await db
    .select({ id: partCategories.id })
    .from(partCategories)
    .where(eq(partCategories.id, categoryId))
    .limit(1)
    // Waits out a Part Category Merge deleting this category, then sees it gone instead of hitting the FK.
    .for('share');

  if (!row) throw new PartCategoryNotFoundError(categoryId);
}

function getPartSortColumn(sortBy: PartListInput['sortBy']) {
  if (sortBy === 'category') return partCategories.name;
  if (sortBy === 'code') return parts.code;
  if (sortBy === 'id') return parts.id;
  if (sortBy === 'supplierCode') return parts.supplierCode;
  if (sortBy === 'supplierName') return supplier.companyName;

  return parts.name;
}

function mapPartUniqueViolation(error: unknown, input: Pick<PartCreateInput, 'code'>): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (constraint?.includes('parts_code_unique') || constraint?.includes('code')) {
    return new DuplicatePartCodeError(input.code);
  }

  return error instanceof Error ? error : new Error(String(error));
}
