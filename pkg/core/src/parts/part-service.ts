import {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  type DatabaseTransaction,
  type Db,
  getSortOrder,
  getUniqueViolationConstraint,
  parts,
  supplier,
  withPagination,
} from '@pkg/db';
import type {
  AuthId,
  Part,
  PartCategoryListResult,
  PartCreateInput,
  PartListInput,
  PartListResult,
  PartUpdateInput,
  UUID,
} from '@pkg/schema';
import { Part as PartSchema } from '@pkg/schema';
import { and, asc, count, eq, or, type SQL, sql } from 'drizzle-orm';

import { createAuditChanges, insertAuditEvent, partAuditDescriptor } from '../audit/audit-service.js';
import {
  DuplicatePartCodeError,
  DuplicatePartSupplierCodeError,
  PartNotFoundError,
  PartSupplierNotFoundError,
} from './part-errors.js';

type PartRow = typeof parts.$inferSelect;
type SupplierRow = Pick<typeof supplier.$inferSelect, 'id' | 'name'>;

type PartWithSupplierRow = PartRow & {
  supplier: SupplierRow;
};

export function mapPart(row: PartWithSupplierRow): Part {
  return PartSchema.parse({
    category: row.category,
    code: row.code,
    description: row.description,
    drawingCode: row.drawingCode,
    finish: row.finish,
    id: row.id,
    name: row.name,
    supplier: row.supplier,
    supplierCode: row.supplierCode,
    supplierId: row.supplierId,
  });
}

export async function listParts({ db, input }: { db: Db; input: PartListInput }): Promise<PartListResult> {
  const sortColumn = getPartSortColumn(input.sortBy);
  const orderBy = getSortOrder(sortColumn, input.sortDirection);
  const where = buildPartListWhere(input);
  const rowsQuery = withPagination(
    db
      .select({
        part: parts,
        supplier: {
          id: supplier.id,
          name: supplier.name,
        },
      })
      .from(parts)
      .innerJoin(supplier, eq(parts.supplierId, supplier.id))
      .where(where)
      .orderBy(orderBy, asc(parts.id))
      .$dynamic(),
    input,
  );
  const totalQuery = db
    .select({ value: count() })
    .from(parts)
    .innerJoin(supplier, eq(parts.supplierId, supplier.id))
    .where(where);
  const [rows, totalRows] = await Promise.all([rowsQuery, totalQuery]);
  const total = totalRows[0]?.value ?? 0;

  return {
    items: rows.map((row) => mapPart({ ...row.part, supplier: row.supplier })),
    total,
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
  };
}

export async function listPartCategories({ db }: { db: Db }): Promise<PartCategoryListResult> {
  const rows = await db.selectDistinct({ category: parts.category }).from(parts).orderBy(asc(parts.category));

  return {
    categories: rows.map((row) => row.category),
  };
}

function buildPartListWhere(input: PartListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.search) {
    const globalSearchWhere = or(
      createGlobalSearchCondition(input.search, [
        sql`${parts.category}`,
        sql`${parts.code}`,
        sql`${parts.description}`,
        sql`${parts.drawingCode}`,
        sql`${parts.finish}`,
        sql`${parts.name}`,
        sql`${parts.supplierCode}`,
        sql`${parts.id}::text`,
      ]),
      createEscapedContainsSearchCondition(sql`${supplier.name}`, input.search),
    );

    if (globalSearchWhere) {
      conditions.push(globalSearchWhere);
    }
  }

  if (input.category) {
    conditions.push(eq(parts.category, input.category));
  }

  if (input.columnFilters.category) {
    conditions.push(createEscapedContainsSearchCondition(sql`${parts.category}`, input.columnFilters.category));
  }

  if (input.columnFilters.code) {
    conditions.push(createEscapedContainsSearchCondition(sql`${parts.code}`, input.columnFilters.code));
  }

  if (input.columnFilters.id) {
    conditions.push(createEscapedContainsSearchCondition(sql`${parts.id}::text`, input.columnFilters.id));
  }

  if (input.columnFilters.name) {
    conditions.push(createEscapedContainsSearchCondition(sql`${parts.name}`, input.columnFilters.name));
  }

  if (input.columnFilters.supplierCode) {
    conditions.push(createEscapedContainsSearchCondition(sql`${parts.supplierCode}`, input.columnFilters.supplierCode));
  }

  if (input.columnFilters.supplierName) {
    conditions.push(createEscapedContainsSearchCondition(sql`${supplier.name}`, input.columnFilters.supplierName));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getPart({ db, id }: { db: Db | DatabaseTransaction; id: UUID }): Promise<Part> {
  const row = await db.query.parts.findFirst({
    where: eq(parts.id, id),
    with: {
      supplier: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!row) {
    throw new PartNotFoundError(id);
  }

  return mapPart(row);
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
      await assertSupplierExists({ db: tx, supplierId: input.supplierId });

      const [row] = await tx.insert(parts).values(input).returning();

      if (!row) {
        throw new Error('Part insert did not return a row');
      }

      await insertAuditEvent({
        db: tx,
        input: {
          action: 'created',
          actorUserId,
          after: row,
          before: null,
          changes: null,
          entityId: row.id,
          entityType: partAuditDescriptor.entityType,
        },
      });

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
    return await db.transaction(async (tx) => {
      await assertSupplierExists({ db: tx, supplierId: input.supplierId });

      const [before] = await tx.select().from(parts).where(eq(parts.id, input.id)).for('update');

      if (!before) {
        throw new PartNotFoundError(input.id);
      }

      const after = {
        ...before,
        category: input.category,
        code: input.code,
        description: input.description,
        drawingCode: input.drawingCode,
        finish: input.finish,
        name: input.name,
        supplierCode: input.supplierCode,
        supplierId: input.supplierId,
      };
      const changes = createAuditChanges(before, after, partAuditDescriptor.fields);

      if (!changes) {
        return getPart({ db: tx, id: before.id });
      }

      const [row] = await tx
        .update(parts)
        .set({
          category: input.category,
          code: input.code,
          description: input.description,
          drawingCode: input.drawingCode,
          finish: input.finish,
          name: input.name,
          supplierCode: input.supplierCode,
          supplierId: input.supplierId,
        })
        .where(eq(parts.id, input.id))
        .returning();

      if (!row) {
        throw new PartNotFoundError(input.id);
      }

      await insertAuditEvent({
        db: tx,
        input: {
          action: 'updated',
          actorUserId,
          after: row,
          before,
          changes,
          entityId: row.id,
          entityType: partAuditDescriptor.entityType,
        },
      });

      return getPart({ db: tx, id: row.id });
    });
  } catch (error) {
    throw mapPartUniqueViolation(error, input);
  }
}

async function assertSupplierExists({
  db,
  supplierId,
}: {
  db: Db | DatabaseTransaction;
  supplierId: UUID;
}): Promise<void> {
  const row = await db.query.supplier.findFirst({
    columns: {
      id: true,
    },
    where: eq(supplier.id, supplierId),
  });

  if (!row) {
    throw new PartSupplierNotFoundError(supplierId);
  }
}

function getPartSortColumn(sortBy: PartListInput['sortBy']) {
  if (sortBy === 'category') return parts.category;
  if (sortBy === 'code') return parts.code;
  if (sortBy === 'id') return parts.id;
  if (sortBy === 'supplierCode') return parts.supplierCode;
  if (sortBy === 'supplierName') return supplier.name;

  return parts.name;
}

function mapPartUniqueViolation(
  error: unknown,
  input: Pick<PartCreateInput, 'code' | 'supplierCode' | 'supplierId'>,
): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (
    constraint?.includes('parts_supplier_id_supplier_code_unique') ||
    constraint?.includes('supplier_id') ||
    constraint?.includes('supplier_code')
  ) {
    return new DuplicatePartSupplierCodeError({
      supplierCode: input.supplierCode,
      supplierId: input.supplierId,
    });
  }

  if (constraint?.includes('parts_code_unique') || constraint?.includes('code')) {
    return new DuplicatePartCodeError(input.code);
  }

  return error instanceof Error ? error : new Error(String(error));
}
