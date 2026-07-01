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
  PartBulkImportInput,
  PartBulkImportResult,
  PartCategoryListResult,
  PartCreateInput,
  PartListInput,
  PartListResult,
  PartUpdateInput,
  UUID,
} from '@pkg/schema';
import { Part as PartSchema } from '@pkg/schema';
import { and, asc, count, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';

import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditUpdate,
} from '../audit/audit-service.js';
import { supplierAuditDescriptor } from '../suppliers/supplier-service.js';
import {
  DuplicatePartCodeError,
  PartBulkImportConflictError,
  PartNotFoundError,
  PartSupplierNotFoundError,
} from './part-errors.js';

type PartRow = typeof parts.$inferSelect;
type SupplierRow = Pick<typeof supplier.$inferSelect, 'companyName' | 'id'>;

export const partAuditDescriptor = defineAuditDescriptor<PartRow>({
  entityType: 'part',
  noun: 'part',
  primaryLabelField: 'name',
  entityId: (row) => row.id,
  toRecord: (row) => ({
    category: row.category,
    code: row.code,
    description: row.description,
    drawingCode: row.drawingCode,
    finish: row.finish,
    isInternallyFabricated: row.isInternallyFabricated,
    name: row.name,
    supplierCode: row.supplierCode,
    supplierId: row.supplierId,
    unitOfMeasure: row.unitOfMeasure,
  }),
});

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
    isInternallyFabricated: row.isInternallyFabricated,
    name: row.name,
    supplier: row.supplier,
    supplierCode: row.supplierCode,
    supplierId: row.supplierId,
    unitOfMeasure: row.unitOfMeasure,
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
          companyName: supplier.companyName,
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
      createEscapedContainsSearchCondition(sql`${supplier.companyName}`, input.search),
    );

    if (globalSearchWhere) {
      conditions.push(globalSearchWhere);
    }
  }

  if (input.category) {
    conditions.push(eq(parts.category, input.category));
  }

  if (input.supplierId) {
    conditions.push(eq(parts.supplierId, input.supplierId));
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

  if (input.columnFilters.isInternallyFabricated !== undefined) {
    conditions.push(eq(parts.isInternallyFabricated, input.columnFilters.isInternallyFabricated));
  }

  if (input.columnFilters.name) {
    conditions.push(createEscapedContainsSearchCondition(sql`${parts.name}`, input.columnFilters.name));
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
  const row = await db.query.parts.findFirst({
    where: eq(parts.id, id),
    with: {
      supplier: {
        columns: {
          id: true,
          companyName: true,
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
    return await db.transaction(async (tx) => {
      await assertSupplierExists({ db: tx, supplierId: input.supplierId });

      const [before] = await tx.select().from(parts).where(eq(parts.id, input.id)).for('update');

      if (!before) {
        throw new PartNotFoundError(input.id);
      }

      const patch = {
        category: input.category,
        code: input.code,
        description: input.description,
        drawingCode: input.drawingCode,
        finish: input.finish,
        isInternallyFabricated: input.isInternallyFabricated,
        name: input.name,
        supplierCode: input.supplierCode,
        supplierId: input.supplierId,
        unitOfMeasure: input.unitOfMeasure,
      };
      const after = { ...before, ...patch };
      const changes = diffAuditUpdate(partAuditDescriptor, before, after);

      if (!changes) {
        return getPart({ db: tx, id: before.id });
      }

      const [row] = await tx.update(parts).set(patch).where(eq(parts.id, input.id)).returning();

      if (!row) {
        throw new PartNotFoundError(input.id);
      }

      await recordAuditUpdate({ db: tx, descriptor: partAuditDescriptor, actorUserId, after: row, changes });

      return getPart({ db: tx, id: row.id });
    });
  } catch (error) {
    throw mapPartUniqueViolation(error, input);
  }
}

export async function bulkImportParts({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PartBulkImportInput;
}): Promise<PartBulkImportResult> {
  try {
    return await db.transaction(async (tx) => {
      const errors: string[] = [];
      let importedCount = 0;
      let updatedCount = 0;
      const scopedSupplier = input.supplierId
        ? await getImportSupplierById({ db: tx, supplierId: input.supplierId })
        : undefined;

      // Preload every supplier and part the import touches in two batched reads rather than two
      // queries per row, so importing thousands of rows stays a constant number of round trips.
      // Suppliers/parts created mid-loop are folded back into these maps so later rows referencing
      // the same name or code resolve them without re-querying.
      const suppliersByName = scopedSupplier
        ? new Map<string, SupplierRow>()
        : await loadImportSuppliersByName({ db: tx, rows: input.rows });
      const partsByCode = await loadImportPartsByCode({ db: tx, rows: input.rows });

      for (const row of input.rows) {
        if (scopedSupplier && row.supplierName.toLowerCase() !== scopedSupplier.companyName.toLowerCase()) {
          errors.push(
            `Line ${row.lineNumber}: Supplier ${row.supplierName} does not match ${scopedSupplier.companyName}.`,
          );
          continue;
        }

        const existingSupplier = scopedSupplier ?? suppliersByName.get(row.supplierName.toLowerCase());
        const partByCode = partsByCode.get(row.code);
        if (partByCode && (!existingSupplier || partByCode.supplierId !== existingSupplier.id)) {
          errors.push(
            await formatBulkImportIdentityConflict({
              db: tx,
              existingPart: partByCode,
              row,
            }),
          );
          continue;
        }

        const importedSupplier =
          existingSupplier ??
          (await createImportSupplier({
            actorUserId,
            db: tx,
            companyName: row.supplierName,
          }));

        if (!existingSupplier) {
          suppliersByName.set(importedSupplier.companyName.toLowerCase(), importedSupplier);
        }

        const partInput = {
          category: row.category,
          code: row.code,
          description: row.description,
          drawingCode: row.drawingCode,
          finish: row.finish,
          isInternallyFabricated: row.isInternallyFabricated,
          name: row.name,
          supplierCode: row.supplierCode,
          supplierId: importedSupplier.id,
          unitOfMeasure: row.unitOfMeasure,
        };
        const existingPart = partByCode;

        if (!existingPart) {
          const [created] = await tx.insert(parts).values(partInput).returning();

          if (!created) {
            throw new Error('Part import insert did not return a row');
          }

          await recordAuditCreate({ db: tx, descriptor: partAuditDescriptor, actorUserId, input: created });
          partsByCode.set(created.code, created);
          importedCount += 1;
          continue;
        }

        const after = {
          ...existingPart,
          ...partInput,
        };
        const changes = diffAuditUpdate(partAuditDescriptor, existingPart, after);

        if (!changes) {
          continue;
        }

        const [updated] = await tx.update(parts).set(partInput).where(eq(parts.id, existingPart.id)).returning();

        if (!updated) {
          throw new PartNotFoundError(existingPart.id);
        }

        await recordAuditUpdate({ db: tx, descriptor: partAuditDescriptor, actorUserId, after: updated, changes });
        partsByCode.set(updated.code, updated);
        updatedCount += 1;
      }

      return {
        errors,
        importedCount,
        updatedCount,
      };
    });
  } catch (error) {
    throw mapPartUniqueViolationForBulkImport(error, input);
  }
}

async function formatBulkImportIdentityConflict({
  db,
  existingPart,
  row,
}: {
  db: DatabaseTransaction;
  existingPart: Pick<PartRow, 'code' | 'supplierCode' | 'supplierId'>;
  row: PartBulkImportInput['rows'][number];
}): Promise<string> {
  const existingSupplier = await db.query.supplier.findFirst({
    columns: {
      companyName: true,
      id: true,
    },
    where: eq(supplier.id, existingPart.supplierId),
  });
  const existingSupplierName = existingSupplier?.companyName ?? 'an unknown supplier';
  const existingIdentity = `${existingSupplierName} / supplier code ${existingPart.supplierCode}`;
  const importIdentity = `${row.supplierName} / ${row.supplierCode}`;

  return `Line ${row.lineNumber}: Part code ${existingPart.code} already exists with supplier ${existingIdentity}; CSV row has ${importIdentity}.`;
}

async function loadImportSuppliersByName({
  db,
  rows,
}: {
  db: DatabaseTransaction;
  rows: PartBulkImportInput['rows'];
}): Promise<Map<string, SupplierRow>> {
  const byName = new Map<string, SupplierRow>();
  const lowerNames = [...new Set(rows.map((row) => row.supplierName.toLowerCase()))];

  if (lowerNames.length === 0) {
    return byName;
  }

  const supplierRows = await db
    .select({
      companyName: supplier.companyName,
      id: supplier.id,
    })
    .from(supplier)
    .where(and(inArray(sql`lower(${supplier.companyName})`, lowerNames), isNull(supplier.deletedAt)));

  for (const supplierRow of supplierRows) {
    byName.set(supplierRow.companyName.toLowerCase(), supplierRow);
  }

  return byName;
}

async function loadImportPartsByCode({
  db,
  rows,
}: {
  db: DatabaseTransaction;
  rows: PartBulkImportInput['rows'];
}): Promise<Map<string, PartRow>> {
  const byCode = new Map<string, PartRow>();
  const codes = [...new Set(rows.map((row) => row.code))];

  if (codes.length === 0) {
    return byCode;
  }

  // FOR UPDATE locks the matching rows up front, the same exclusive locking the per-row read used
  // to take — just in one statement with a consistent lock order.
  const partRows = await db.select().from(parts).where(inArray(parts.code, codes)).for('update');

  for (const partRow of partRows) {
    byCode.set(partRow.code, partRow);
  }

  return byCode;
}

async function getImportSupplierById({
  db,
  supplierId,
}: {
  db: DatabaseTransaction;
  supplierId: UUID;
}): Promise<SupplierRow> {
  const row = await db.query.supplier.findFirst({
    columns: {
      companyName: true,
      id: true,
    },
    where: and(eq(supplier.id, supplierId), isNull(supplier.deletedAt)),
  });

  if (!row) {
    throw new PartSupplierNotFoundError(supplierId);
  }

  return row;
}

async function createImportSupplier({
  actorUserId,
  companyName,
  db,
}: {
  actorUserId: AuthId;
  companyName: string;
  db: DatabaseTransaction;
}): Promise<SupplierRow> {
  const [created] = await db.insert(supplier).values({ companyName }).returning();

  if (!created) {
    throw new Error('Supplier import insert did not return a row');
  }

  await recordAuditCreate({ db, descriptor: supplierAuditDescriptor, actorUserId, input: created });

  return {
    companyName: created.companyName,
    id: created.id,
  };
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
    where: and(eq(supplier.id, supplierId), isNull(supplier.deletedAt)),
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

function mapPartUniqueViolationForBulkImport(error: unknown, input: PartBulkImportInput): Error {
  if (error instanceof PartBulkImportConflictError) {
    return error;
  }

  const constraint = getUniqueViolationConstraint(error);
  const conflictingRow =
    constraint?.includes('parts_code_unique') || constraint?.includes('code')
      ? input.rows.find((row) => row.code)
      : undefined;

  if (constraint !== null && conflictingRow) {
    return new PartBulkImportConflictError({
      code: conflictingRow.code,
      supplierCode: conflictingRow.supplierCode,
      supplierName: conflictingRow.supplierName,
    });
  }

  return error instanceof Error ? error : new Error(String(error));
}
