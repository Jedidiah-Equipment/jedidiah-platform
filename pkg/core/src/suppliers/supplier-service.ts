import {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  type Db,
  getPaginationQueryOptions,
  getSortOrder,
  getUniqueViolationConstraint,
  supplier,
} from '@pkg/db';
import type {
  AuthId,
  Supplier,
  SupplierCreateInput,
  SupplierListInput,
  SupplierListResult,
  SupplierUpdateInput,
  UUID,
} from '@pkg/schema';
import { Supplier as SupplierSchema } from '@pkg/schema';
import { and, asc, eq, type SQL, sql } from 'drizzle-orm';

import { createAuditChanges, insertAuditEvent, supplierAuditDescriptor } from '../audit/audit-service.js';
import { DuplicateSupplierNameError, SupplierNotFoundError } from './supplier-errors.js';

type SupplierRow = typeof supplier.$inferSelect;

export function mapSupplier(row: SupplierRow): Supplier {
  return SupplierSchema.parse({
    id: row.id,
    name: row.name,
  });
}

export async function listSuppliers({ db, input }: { db: Db; input: SupplierListInput }): Promise<SupplierListResult> {
  const sortColumn = getSupplierSortColumn(input.sortBy);
  const orderBy = getSortOrder(sortColumn, input.sortDirection);
  const where = buildSupplierListWhere(input);
  const rows = await db.query.supplier.findMany({
    where,
    orderBy: [orderBy, asc(supplier.id)],
    ...getPaginationQueryOptions(input),
  });
  const total = await db.$count(supplier, where);

  return {
    items: rows.map(mapSupplier),
    total,
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
  };
}

function buildSupplierListWhere(input: SupplierListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.search) {
    const globalSearchWhere = createGlobalSearchCondition(input.search, [
      sql`${supplier.name}`,
      sql`${supplier.id}::text`,
    ]);

    if (globalSearchWhere) {
      conditions.push(globalSearchWhere);
    }
  }

  if (input.columnFilters.name) {
    conditions.push(createEscapedContainsSearchCondition(sql`${supplier.name}`, input.columnFilters.name));
  }

  if (input.columnFilters.id) {
    conditions.push(createEscapedContainsSearchCondition(sql`${supplier.id}::text`, input.columnFilters.id));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getSupplier({ db, id }: { db: Db; id: UUID }): Promise<Supplier> {
  const row = await db.query.supplier.findFirst({
    where: eq(supplier.id, id),
  });

  if (!row) {
    throw new SupplierNotFoundError(id);
  }

  return mapSupplier(row);
}

export async function createSupplier({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: SupplierCreateInput;
}): Promise<Supplier> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.insert(supplier).values(input).returning();

      if (!row) {
        throw new Error('Supplier insert did not return a row');
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
          entityType: supplierAuditDescriptor.entityType,
        },
      });

      return mapSupplier(row);
    });
  } catch (error) {
    throw mapSupplierUniqueViolation(error, input);
  }
}

export async function updateSupplier({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: SupplierUpdateInput;
}): Promise<Supplier> {
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(supplier).where(eq(supplier.id, input.id)).for('update');

      if (!before) {
        throw new SupplierNotFoundError(input.id);
      }

      const after = {
        ...before,
        name: input.name,
      };
      const changes = createAuditChanges(before, after, supplierAuditDescriptor.fields);

      if (!changes) {
        return mapSupplier(before);
      }

      const [row] = await tx.update(supplier).set({ name: input.name }).where(eq(supplier.id, input.id)).returning();

      if (!row) {
        throw new SupplierNotFoundError(input.id);
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
          entityType: supplierAuditDescriptor.entityType,
        },
      });

      return mapSupplier(row);
    });
  } catch (error) {
    throw mapSupplierUniqueViolation(error, input);
  }
}

function getSupplierSortColumn(sortBy: SupplierListInput['sortBy']) {
  if (sortBy === 'id') {
    return supplier.id;
  }

  return supplier.name;
}

function mapSupplierUniqueViolation(error: unknown, input: Pick<SupplierCreateInput, 'name'>): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (constraint !== null) {
    return new DuplicateSupplierNameError(input.name);
  }

  return error instanceof Error ? error : new Error(String(error));
}
