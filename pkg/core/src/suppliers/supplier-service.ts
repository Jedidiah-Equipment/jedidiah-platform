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
import { and, asc, eq, isNull, type SQL, sql } from 'drizzle-orm';

import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditDelete,
  recordAuditUpdate,
} from '../audit/audit-service.js';
import { DuplicateSupplierNameError, SupplierNotFoundError } from './supplier-errors.js';

type SupplierRow = typeof supplier.$inferSelect;

export const supplierAuditDescriptor = defineAuditDescriptor<SupplierRow>({
  entityType: 'supplier',
  noun: 'supplier',
  primaryLabelField: 'companyName',
  entityId: (row) => row.id,
  toRecord: (row) => ({
    address: row.address,
    companyName: row.companyName,
    contactPerson: row.contactPerson,
    email: row.email,
    notes: row.notes,
    phone: row.phone,
    thumbnailDataUrl: row.thumbnailDataUrl,
  }),
});

export function mapSupplier(row: SupplierRow): Supplier {
  return SupplierSchema.parse({
    address: row.address,
    companyName: row.companyName,
    contactPerson: row.contactPerson,
    createdAt: row.createdAt.toISOString(),
    email: row.email,
    id: row.id,
    notes: row.notes,
    phone: row.phone,
    thumbnailDataUrl: row.thumbnailDataUrl,
    updatedAt: row.updatedAt.toISOString(),
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

function buildSupplierListWhere(input: SupplierListInput): SQL {
  const conditions: SQL[] = [isNull(supplier.deletedAt)];

  if (input.search) {
    const globalSearchWhere = createGlobalSearchCondition(input.search, [
      sql`${supplier.companyName}`,
      sql`${supplier.email}`,
      sql`${supplier.id}::text`,
    ]);

    if (globalSearchWhere) {
      conditions.push(globalSearchWhere);
    }
  }

  if (input.columnFilters.companyName) {
    conditions.push(
      createEscapedContainsSearchCondition(sql`${supplier.companyName}`, input.columnFilters.companyName),
    );
  }

  if (input.columnFilters.email) {
    conditions.push(createEscapedContainsSearchCondition(sql`${supplier.email}`, input.columnFilters.email));
  }

  if (input.columnFilters.id) {
    conditions.push(createEscapedContainsSearchCondition(sql`${supplier.id}::text`, input.columnFilters.id));
  }

  return and(...conditions) as SQL;
}

export async function getSupplier({ db, id }: { db: Db; id: UUID }): Promise<Supplier> {
  const row = await db.query.supplier.findFirst({
    where: and(eq(supplier.id, id), isNull(supplier.deletedAt)),
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

      await recordAuditCreate({ db: tx, descriptor: supplierAuditDescriptor, actorUserId, input: row });

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

      const patch = {
        address: input.address,
        companyName: input.companyName,
        contactPerson: input.contactPerson,
        email: input.email,
        notes: input.notes,
        phone: input.phone,
        thumbnailDataUrl: input.thumbnailDataUrl,
      };
      const after = { ...before, ...patch };
      const changes = diffAuditUpdate(supplierAuditDescriptor, before, after);

      if (!changes) {
        return mapSupplier(before);
      }

      const [row] = await tx
        .update(supplier)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(supplier.id, input.id))
        .returning();

      if (!row) {
        throw new SupplierNotFoundError(input.id);
      }

      await recordAuditUpdate({ db: tx, descriptor: supplierAuditDescriptor, actorUserId, after: row, changes });

      return mapSupplier(row);
    });
  } catch (error) {
    throw mapSupplierUniqueViolation(error, input);
  }
}

export async function removeSupplier({
  actorUserId,
  db,
  id,
}: {
  actorUserId: AuthId;
  db: Db;
  id: UUID;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(supplier)
      .where(and(eq(supplier.id, id), isNull(supplier.deletedAt)))
      .for('update');

    if (!before) {
      throw new SupplierNotFoundError(id);
    }

    const now = new Date();
    await tx.update(supplier).set({ deletedAt: now, updatedAt: now }).where(eq(supplier.id, id));

    await recordAuditDelete({ db: tx, descriptor: supplierAuditDescriptor, actorUserId, input: before });
  });
}

function getSupplierSortColumn(sortBy: SupplierListInput['sortBy']) {
  if (sortBy === 'createdAt') {
    return supplier.createdAt;
  }

  if (sortBy === 'email') {
    return supplier.email;
  }

  if (sortBy === 'id') {
    return supplier.id;
  }

  return supplier.companyName;
}

function mapSupplierUniqueViolation(error: unknown, input: Pick<SupplierCreateInput, 'companyName'>): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (constraint !== null) {
    return new DuplicateSupplierNameError(input.companyName);
  }

  return error instanceof Error ? error : new Error(String(error));
}
