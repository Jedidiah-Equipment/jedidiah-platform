import {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  type DatabaseTransaction,
  type Db,
  getSortOrder,
  getUniqueViolationConstraint,
  partBom,
  parts,
  purchaseOrderLines,
  purchaseOrders,
  stockMovements,
  supplier,
  withPagination,
} from '@pkg/db';
import type {
  AuthId,
  Part,
  PartBulkExportInput,
  PartBulkExportRow,
  PartBulkImportInput,
  PartBulkImportResult,
  PartCategoryListResult,
  PartCreateInput,
  PartListInput,
  PartListResult,
  PartStorageLocationListResult,
  PartUpdateInput,
  UUID,
} from '@pkg/schema';
import { getNextCursor, Part as PartSchema, unitClassFor } from '@pkg/schema';
import { and, asc, count, eq, inArray, isNotNull, isNull, ne, or, type SQL, sql } from 'drizzle-orm';

import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditUpdate,
} from '../audit/audit-service.js';
import { mutateEntity } from '../audit/mutate-entity.js';
import { supplierAuditDescriptor } from '../suppliers/supplier-service.js';
import {
  DuplicatePartCodeError,
  NO_SUPPLIER_LABEL,
  PartBomLockedError,
  PartBulkImportConflictError,
  PartNotFoundError,
  PartSupplierLockedByPurchaseOrderError,
  PartSupplierNotFoundError,
  PartUnitOfMeasureLockedError,
} from './part-errors.js';

type PartRow = typeof parts.$inferSelect;
type SupplierRow = Pick<typeof supplier.$inferSelect, 'companyName' | 'id'>;

export const partAuditDescriptor = defineAuditDescriptor<PartRow>({
  entityType: 'part',
  noun: 'part',
  primaryLabelField: 'name',
  entityId: (row) => row.id,
  toRecord: (row) => ({
    averageUtilizationPercent: row.averageUtilizationPercent,
    category: row.category,
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
  /** Null on a Built Part, which is made in-house and bought from nobody. */
  supplier: SupplierRow | null;
};

export function mapPart(row: PartWithSupplierRow): Part {
  return PartSchema.parse({
    averageUtilizationPercent: row.averageUtilizationPercent,
    category: row.category,
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
      .leftJoin(supplier, eq(parts.supplierId, supplier.id))
      .where(where)
      .orderBy(orderBy, asc(parts.id))
      .$dynamic(),
    input,
  );
  const totalQuery = db
    .select({ value: count() })
    .from(parts)
    .leftJoin(supplier, eq(parts.supplierId, supplier.id))
    .where(where);
  const [rows, totalRows] = await Promise.all([rowsQuery, totalQuery]);
  const total = totalRows[0]?.value ?? 0;
  const items = rows.map((row) => mapPart({ ...row.part, supplier: row.supplier }));

  return {
    items,
    nextCursor: getNextCursor({ count: items.length, cursor: input.cursor, total }),
    total,
  };
}

export async function listPartCategories({ db }: { db: Db }): Promise<PartCategoryListResult> {
  const rows = await db.selectDistinct({ category: parts.category }).from(parts).orderBy(asc(parts.category));

  return {
    categories: rows.map((row) => row.category),
  };
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
        sql`${parts.category}`,
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
    return await mutateEntity({
      actorUserId,
      assert: async (tx, before) => {
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
        category: input.category,
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

/**
 * The Parts catalog in the shape the bulk import reads back, so a user can take the file out, edit
 * it, and put it in again. It carries only what the import writes — the stock policy, location and
 * minimum a Part also holds are not the CSV's to own, so they are not the CSV's to hand out either.
 */
export async function bulkExportParts({
  db,
  input,
}: {
  db: Db;
  input: PartBulkExportInput;
}): Promise<PartBulkExportRow[]> {
  const { supplierId } = input;

  return (
    db
      .select({
        category: parts.category,
        code: parts.code,
        description: parts.description,
        drawingCode: parts.drawingCode,
        finish: parts.finish,
        isInternallyFabricated: parts.isInternallyFabricated,
        name: parts.name,
        standardPurchaseLengthMm: parts.standardPurchaseLengthMm,
        supplierCode: parts.supplierCode,
        supplierName: supplier.companyName,
        unitOfMeasure: parts.unitOfMeasure,
      })
      .from(parts)
      .leftJoin(supplier, eq(parts.supplierId, supplier.id))
      // The same removed-Supplier filter the Parts list applies. Without it the export would write a
      // row the import cannot read back: the import resolves Suppliers among the live ones only, so a
      // removed one reads as a Supplier that does not exist yet and the row is refused as a conflict.
      // A Built Part joins to no Supplier at all, and a null `deletedAt` keeps it in.
      .where(and(isNull(supplier.deletedAt), supplierId ? eq(parts.supplierId, supplierId) : undefined))
      .orderBy(asc(parts.code))
  );
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
      const suppliersByLookupName = scopedSupplier
        ? new Map<string, SupplierRow>()
        : await loadImportSuppliersByLookupName({ db: tx, rows: input.rows });
      const partsByCode = await loadImportPartsByCode({ db: tx, rows: input.rows });

      for (const row of input.rows) {
        // Whether this row names a Supplier is settled once, here. Everything below reads the one
        // resolved value, so a built Part — made in-house and bought from nobody — takes the same
        // path as a bought one rather than branching at every step.
        const rowSupplier = resolveRowSupplier({ row, scopedSupplier, suppliersByLookupName });
        if ('error' in rowSupplier) {
          errors.push(rowSupplier.error);
          continue;
        }

        const partByCode = partsByCode.get(row.code);
        if (partByCode && !matchesStoredIdentity(rowSupplier, partByCode)) {
          errors.push(
            await formatBulkImportIdentityConflict({
              db: tx,
              existingPart: partByCode,
              row,
            }),
          );
          continue;
        }

        // Created only now, so a row rejected above never leaves a stray Supplier behind.
        const supplierId = await ensureImportSupplierId({ actorUserId, db: tx, rowSupplier, suppliersByLookupName });

        // Bulk CSV owns catalog identity; stock policy/location/minimum default on create and survive updates.
        const partInput = {
          category: row.category,
          code: row.code,
          description: row.description,
          drawingCode: row.drawingCode,
          finish: row.finish,
          isInternallyFabricated: row.isInternallyFabricated,
          name: row.name,
          standardPurchaseLengthMm: row.standardPurchaseLengthMm ?? null,
          supplierCode: row.supplierCode,
          supplierId,
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

        const [lockedPart] = await tx.select().from(parts).where(eq(parts.id, existingPart.id)).for('update');
        if (!lockedPart) throw new PartNotFoundError(existingPart.id);

        if (lockedPart.averageUtilizationPercent !== null && unitClassFor(partInput.unitOfMeasure) !== 'discrete') {
          errors.push(
            `Line ${row.lineNumber}: clear Average utilization % before changing this Part to a measured or linear unit.`,
          );
          continue;
        }

        const after = {
          ...lockedPart,
          ...partInput,
        };
        const changes = diffAuditUpdate(partAuditDescriptor, lockedPart, after);

        if (!changes) {
          continue;
        }

        await assertUnitOfMeasureMutable({
          before: lockedPart,
          db: tx,
          nextUnitOfMeasure: partInput.unitOfMeasure,
        });
        await assertSupplierMutable({
          before: lockedPart,
          db: tx,
          nextSupplierId: partInput.supplierId,
        });

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

async function assertUnitOfMeasureMutable({
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

async function assertSupplierMutable({
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

/**
 * What one CSV row says about its Supplier, settled before anything is written. A row either names
 * no Supplier at all (a built Part), names one already loaded, or names one nobody has seen yet —
 * and the last of those only becomes a Supplier once the row's identity has passed.
 */
type RowSupplier =
  | { kind: 'existing'; supplier: SupplierRow }
  | { kind: 'new'; companyName: string }
  | { kind: 'none' };

function resolveRowSupplier({
  row,
  scopedSupplier,
  suppliersByLookupName,
}: {
  row: PartBulkImportInput['rows'][number];
  scopedSupplier: SupplierRow | undefined;
  suppliersByLookupName: ReadonlyMap<string, SupplierRow>;
}): RowSupplier | { error: string } {
  if (row.supplierName === null) return { kind: 'none' };

  if (scopedSupplier) {
    return supplierLookupName(row.supplierName) === supplierLookupName(scopedSupplier.companyName)
      ? { kind: 'existing', supplier: scopedSupplier }
      : { error: `Line ${row.lineNumber}: Supplier ${row.supplierName} does not match ${scopedSupplier.companyName}.` };
  }

  const existing = suppliersByLookupName.get(supplierLookupName(row.supplierName));

  return existing ? { kind: 'existing', supplier: existing } : { kind: 'new', companyName: row.supplierName };
}

/**
 * A Part's identity is its code plus who supplies it. A row naming a Supplier that does not exist
 * yet can never match a stored Part, since no stored Part could already point at it.
 */
function matchesStoredIdentity(rowSupplier: RowSupplier, part: Pick<PartRow, 'supplierId'>): boolean {
  if (rowSupplier.kind === 'none') return part.supplierId === null;

  return rowSupplier.kind === 'existing' && part.supplierId === rowSupplier.supplier.id;
}

async function ensureImportSupplierId({
  actorUserId,
  db,
  rowSupplier,
  suppliersByLookupName,
}: {
  actorUserId: AuthId;
  db: DatabaseTransaction;
  rowSupplier: RowSupplier;
  suppliersByLookupName: Map<string, SupplierRow>;
}): Promise<string | null> {
  if (rowSupplier.kind === 'none') return null;
  if (rowSupplier.kind === 'existing') return rowSupplier.supplier.id;

  const created = await createImportSupplier({ actorUserId, companyName: rowSupplier.companyName, db });
  // Folded back so a later row naming the same Supplier resolves it without creating a second one.
  suppliersByLookupName.set(supplierLookupName(created.companyName), created);

  return created.id;
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
  const existingSupplier =
    existingPart.supplierId === null
      ? null
      : await db.query.supplier.findFirst({
          columns: {
            companyName: true,
            id: true,
          },
          where: eq(supplier.id, existingPart.supplierId),
        });
  const existingSupplierName =
    existingPart.supplierId === null ? NO_SUPPLIER_LABEL : (existingSupplier?.companyName ?? 'an unknown supplier');
  const existingIdentity = `${existingSupplierName} / supplier code ${existingPart.supplierCode}`;
  const importIdentity = `${row.supplierName ?? NO_SUPPLIER_LABEL} / ${row.supplierCode}`;

  return `Line ${row.lineNumber}: Part code ${existingPart.code} already exists with supplier ${existingIdentity}; CSV row has ${importIdentity}.`;
}

async function loadImportSuppliersByLookupName({
  db,
  rows,
}: {
  db: DatabaseTransaction;
  rows: PartBulkImportInput['rows'];
}): Promise<Map<string, SupplierRow>> {
  const byLookupName = new Map<string, SupplierRow>();
  const lookupNames = [
    ...new Set(rows.flatMap((row) => (row.supplierName ? [supplierLookupName(row.supplierName)] : []))),
  ];

  if (lookupNames.length === 0) {
    return byLookupName;
  }

  const supplierRows = await db
    .select({
      companyName: supplier.companyName,
      id: supplier.id,
      lookupName: supplierLookupNameSql,
    })
    .from(supplier)
    .where(and(inArray(supplierLookupNameSql, lookupNames), isNull(supplier.deletedAt)))
    // Two live Suppliers can share a lookup name — the unique index covers the exact stored spelling
    // only — so the oldest wins and every row of the import resolves to the same one.
    .orderBy(supplier.createdAt, supplier.id);

  for (const supplierRow of supplierRows) {
    // Keyed by the value the database computed, so a Supplier the filter matched can never miss the
    // map through the two normalizers disagreeing.
    if (!byLookupName.has(supplierRow.lookupName)) {
      byLookupName.set(supplierRow.lookupName, { companyName: supplierRow.companyName, id: supplierRow.id });
    }
  }

  return byLookupName;
}

/**
 * How an import decides that a CSV cell and a stored Supplier name the same Supplier: casing and
 * whitespace are noise, everything else is identity. It never touches what is stored — a matched
 * Supplier keeps its own spelling, and a created one is stored as the row wrote it. Anything looser
 * than this ("Night Wolves" against "Nightwolves") is a merge somebody has to decide on.
 *
 * The class is spelled out rather than written `\s` because this rule is applied twice, once here and
 * once in the database, and the two languages disagree about what `\s` means: a non-breaking space is
 * whitespace to JavaScript and is not to Postgres. Only the characters both agree on are noise, and
 * `trim` is spelled out for the same reason — it would strip more than `btrim` does.
 */
function supplierLookupName(companyName: string): string {
  return companyName
    .toLowerCase()
    .replaceAll(/[ \t\n\r\f\v]+/g, ' ')
    .replaceAll(/^ | $/g, '');
}

/** The database's side of {@link supplierLookupName}, character for character. */
const supplierLookupNameSql = sql<string>`btrim(regexp_replace(lower(${supplier.companyName}), '[ \\t\\n\\r\\f\\v]+', ' ', 'g'))`;

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

/** A Built Part names no Supplier, so there is nothing to check; the XOR rule is Zod's and the DB's. */
async function assertSupplierExists({
  db,
  supplierId,
}: {
  db: Db | DatabaseTransaction;
  supplierId: UUID | null;
}): Promise<void> {
  if (supplierId === null) return;

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
