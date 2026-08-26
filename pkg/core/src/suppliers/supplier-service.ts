import {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  type Db,
  getPaginationQueryOptions,
  getSortOrder,
  getUniqueViolationConstraint,
  parts,
  purchaseOrders,
  supplier,
} from '@pkg/db';
import type {
  AuthId,
  Supplier,
  SupplierCreateInput,
  SupplierListInput,
  SupplierListResult,
  SupplierMergeInput,
  SupplierMergePreview,
  SupplierUpdateInput,
  UUID,
} from '@pkg/schema';
import { getNextCursor, Supplier as SupplierSchema } from '@pkg/schema';
import { and, asc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';

import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditDelete,
  recordAuditEvent,
  recordAuditUpdate,
} from '../audit/audit-service.js';
import { mutateEntity } from '../audit/mutate-entity.js';
import {
  DuplicateSupplierNameError,
  SupplierHasDraftPurchaseOrdersError,
  SupplierMergeSelfError,
  SupplierNotFoundError,
} from './supplier-errors.js';

type SupplierRow = typeof supplier.$inferSelect;

const FILL_EMPTY_FIELDS = ['address', 'contactPerson', 'email', 'notes', 'phone', 'thumbnailDataUrl'] as const;

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
  const items = rows.map(mapSupplier);

  return {
    items,
    nextCursor: getNextCursor({ count: items.length, cursor: input.cursor, total }),
    total,
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
    return await mutateEntity({
      actorUserId,
      db,
      descriptor: supplierAuditDescriptor,
      id: input.id,
      lockWhere: isNull(supplier.deletedAt),
      notFound: () => new SupplierNotFoundError(input.id),
      project: (_tx, row) => mapSupplier(row),
      set: () => ({
        address: input.address,
        companyName: input.companyName,
        contactPerson: input.contactPerson,
        email: input.email,
        notes: input.notes,
        phone: input.phone,
        thumbnailDataUrl: input.thumbnailDataUrl,
        updatedAt: new Date(),
      }),
      table: supplier,
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

    // Approved counts alongside draft: the order has not gone out, so removing its Supplier would
    // strand one that is cleared to be sent. Sent and cancelled orders keep their Supplier as history.
    const [unsentPurchaseOrder] = await tx
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.supplierId, id), inArray(purchaseOrders.status, ['draft', 'approved'])))
      .limit(1);
    if (unsentPurchaseOrder) throw new SupplierHasDraftPurchaseOrdersError(id);

    const now = new Date();
    await tx.update(supplier).set({ deletedAt: now, updatedAt: now }).where(eq(supplier.id, id));

    await recordAuditDelete({ db: tx, descriptor: supplierAuditDescriptor, actorUserId, input: before });
  });
}

export async function getSupplierMergePreview({
  db,
  sourceId,
}: {
  db: Db;
  sourceId: UUID;
}): Promise<SupplierMergePreview> {
  await getSupplier({ db, id: sourceId });

  const [partCount, purchaseOrderCount] = await Promise.all([
    db.$count(parts, eq(parts.supplierId, sourceId)),
    db.$count(purchaseOrders, eq(purchaseOrders.supplierId, sourceId)),
  ]);

  return { partCount, purchaseOrderCount };
}

export async function mergeSupplier({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: SupplierMergeInput;
}): Promise<Supplier> {
  const { sourceId, targetId } = input;
  if (sourceId === targetId) throw new SupplierMergeSelfError(sourceId);

  return db.transaction(async (tx) => {
    // Lock both suppliers in one statement so concurrent merges cannot disagree on lock order.
    const rows = await tx
      .select()
      .from(supplier)
      .where(and(inArray(supplier.id, [sourceId, targetId]), isNull(supplier.deletedAt)))
      .for('update');
    const source = rows.find((row) => row.id === sourceId);
    const target = rows.find((row) => row.id === targetId);
    if (!source) throw new SupplierNotFoundError(sourceId);
    if (!target) throw new SupplierNotFoundError(targetId);

    const movedParts = await tx
      .update(parts)
      .set({ supplierId: targetId })
      .where(eq(parts.supplierId, sourceId))
      .returning({ id: parts.id });
    const now = new Date();
    const movedOrders = await tx
      .update(purchaseOrders)
      .set({ supplierId: targetId, updatedAt: now })
      .where(eq(purchaseOrders.supplierId, sourceId))
      .returning({ id: purchaseOrders.id });

    const fillPatch: Partial<SupplierRow> = {};
    for (const field of FILL_EMPTY_FIELDS) {
      if (isEmptySupplierField(target[field]) && !isEmptySupplierField(source[field])) {
        fillPatch[field] = source[field];
      }
    }

    let mergedTarget = target;
    if (Object.keys(fillPatch).length > 0) {
      const [updated] = await tx
        .update(supplier)
        .set({ ...fillPatch, updatedAt: now })
        .where(eq(supplier.id, targetId))
        .returning();
      if (!updated) throw new Error('Supplier merge fill update did not return a row');
      mergedTarget = updated;
      const changes = diffAuditUpdate(supplierAuditDescriptor, target, updated);
      if (changes) {
        await recordAuditUpdate({ db: tx, descriptor: supplierAuditDescriptor, actorUserId, after: updated, changes });
      }
    }

    await tx.update(supplier).set({ deletedAt: now, updatedAt: now }).where(eq(supplier.id, sourceId));

    const counts = {
      movedParts: { from: null, to: movedParts.length },
      movedPurchaseOrders: { from: null, to: movedOrders.length },
    };
    await recordAuditEvent({
      db: tx,
      descriptor: supplierAuditDescriptor,
      action: 'merged',
      actorUserId,
      entityId: sourceId,
      changes: {
        mergedIntoSupplier: { from: source.companyName, to: target.companyName },
        ...counts,
      },
      record: supplierAuditDescriptor.toRecord(source),
      summary: `Merged supplier '${source.companyName}' into '${target.companyName}'`,
    });
    await recordAuditEvent({
      db: tx,
      descriptor: supplierAuditDescriptor,
      action: 'merged',
      actorUserId,
      entityId: targetId,
      changes: {
        absorbedSupplier: { from: source.companyName, to: target.companyName },
        ...counts,
      },
      record: supplierAuditDescriptor.toRecord(mergedTarget),
      summary: `Absorbed supplier '${source.companyName}' (${movedParts.length} parts, ${movedOrders.length} purchase orders)`,
    });

    return mapSupplier(mergedTarget);
  });
}

function isEmptySupplierField(value: string | null): boolean {
  return value === null || value.trim() === '';
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
