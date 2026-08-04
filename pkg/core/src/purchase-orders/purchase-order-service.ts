import { randomUUID } from 'node:crypto';

import {
  createEscapedContainsSearchCondition,
  type DatabaseTransaction,
  type Db,
  documents,
  getPaginationQueryOptions,
  getSortOrder,
  jobs,
  parts,
  purchaseOrderJobLinks,
  purchaseOrderLines,
  purchaseOrders,
  stockMovements,
  supplier,
  user,
} from '@pkg/db';
import { compareNullableDateOnly, derivePurchaseOrderProgress, derivePurchaseOrderStatus } from '@pkg/domain';
import {
  type AuthId,
  DateIso,
  formatPurchaseOrderCode,
  getNextCursor,
  isWholeUnitQuantity,
  type PurchaseOrder,
  type PurchaseOrderCreateInput,
  type PurchaseOrderListInput,
  type PurchaseOrderListResult,
  type PurchaseOrderPdfModel,
  type PurchaseOrderPdfRenderer,
  type PurchaseOrderProgress,
  type PurchaseOrderSaveDraftInput,
  PurchaseOrder as PurchaseOrderSchema,
  type UUID,
  unitClassFor,
} from '@pkg/schema';
import { and, count, desc, eq, inArray, isNull, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm';

import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditUpdate,
} from '../audit/audit-service.js';
import { mutateEntity } from '../audit/mutate-entity.js';
import { DocumentNotFoundError } from '../documents/document-errors.js';
import type { ReadDocumentResult } from '../documents/document-service.js';
import {
  createDocumentRecord,
  documentBaseSelect,
  mapDocumentSummary,
  sanitizeDocumentStorageKeySuffix,
} from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import { JobNotFoundError } from '../jobs/job-errors.js';
import {
  PurchaseOrderAlreadyCancelledError,
  PurchaseOrderAlreadyClosedShortError,
  PurchaseOrderEmptyError,
  PurchaseOrderFullyReceivedError,
  PurchaseOrderHasReceiptsError,
  PurchaseOrderInvalidQuantityError,
  PurchaseOrderLineNotPricedError,
  PurchaseOrderNoReceiptsError,
  PurchaseOrderNotDraftError,
  PurchaseOrderNotFoundError,
  PurchaseOrderNotSentError,
  PurchaseOrderPartNotFoundError,
  PurchaseOrderPartNotPurchasableError,
  PurchaseOrderPartSupplierMismatchError,
  PurchaseOrderSupplierNotFoundError,
} from './purchase-order-errors.js';

type PurchaseOrderRow = typeof purchaseOrders.$inferSelect;
type PurchaseOrderDb = Db | DatabaseTransaction;

export const purchaseOrderAuditDescriptor = defineAuditDescriptor<PurchaseOrderRow>({
  entityId: (row) => row.id,
  entityType: 'purchase_order',
  label: (row) => formatPurchaseOrderCode(row.code),
  noun: 'Purchase Order',
  primaryLabelField: 'code',
  toRecord: (row) => ({
    closedShortAt: row.closedShortAt?.toISOString() ?? null,
    code: formatPurchaseOrderCode(row.code),
    expectedDeliveryDate: row.expectedDeliveryDate,
    sentAt: row.sentAt?.toISOString() ?? null,
    status: row.status,
    supplierId: row.supplierId,
  }),
});

/** A draft is audited as one aggregate: header fields alongside the lines and Job links it carries. */
const purchaseOrderDraftAuditDescriptor = defineAuditDescriptor<PurchaseOrder>({
  entityId: (purchaseOrder) => purchaseOrder.id,
  entityType: 'purchase_order',
  label: (purchaseOrder) => purchaseOrder.code,
  noun: 'Purchase Order',
  primaryLabelField: 'code',
  toRecord: (purchaseOrder) => ({
    expectedDeliveryDate: purchaseOrder.expectedDeliveryDate,
    supplierId: purchaseOrder.supplierId,
  }),
  toCollections: (purchaseOrder) => ({
    job: purchaseOrder.jobs.map((job) => ({
      key: job.id,
      label: job.code,
      value: { code: job.code, id: job.id },
    })),
    line: purchaseOrder.lines.map((line) => ({
      key: line.partId,
      label: line.partCode,
      value: { partId: line.partId, quantity: line.quantity, unitPrice: line.unitPrice },
    })),
  }),
});

export async function createPurchaseOrder({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PurchaseOrderCreateInput;
}): Promise<PurchaseOrder> {
  return db.transaction((tx) => createPurchaseOrderWithin({ actorUserId, db: tx, input }));
}

/**
 * The create itself, inside a caller's transaction. Seeding a selection raises one order per
 * Supplier and must not leave half of them behind on a failure, so it owns the transaction and
 * calls this rather than the wrapper above.
 */
export async function createPurchaseOrderWithin({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: DatabaseTransaction;
  input: PurchaseOrderCreateInput;
}): Promise<PurchaseOrder> {
  await assertSupplierExists({ db, supplierId: input.supplierId });
  const [row] = await db
    .insert(purchaseOrders)
    .values({ expectedDeliveryDate: input.expectedDeliveryDate, supplierId: input.supplierId })
    .returning();
  if (!row) throw new Error('Purchase Order insert did not return a row');

  await recordAuditCreate({ actorUserId, db, descriptor: purchaseOrderAuditDescriptor, input: row });
  return getPurchaseOrder({ db, id: row.id });
}

export async function getPurchaseOrder({ db, id }: { db: PurchaseOrderDb; id: UUID }): Promise<PurchaseOrder> {
  const aggregate = await loadPurchaseOrderAggregate({ db, id });
  if (!aggregate) throw new PurchaseOrderNotFoundError(id);

  const [documentIds, receivedQuantities] = await Promise.all([
    loadLatestDocumentIds({ db, purchaseOrderIds: [id] }),
    loadReceivedQuantities({ db, purchaseOrderIds: [id] }),
  ]);

  return mapPurchaseOrder(aggregate, documentIds.get(id) ?? null, receivedQuantities);
}

/**
 * Cumulative receipts per order line, keyed by the line's own composite identity. The derived
 * `partially received` / `received` states are read from this and never stored (spec §4).
 */
async function loadReceivedQuantities({
  db,
  purchaseOrderIds,
}: {
  db: PurchaseOrderDb;
  purchaseOrderIds: readonly UUID[];
}): Promise<Map<string, number>> {
  if (purchaseOrderIds.length === 0) return new Map();

  const rows = await db
    .select({
      partId: stockMovements.partId,
      purchaseOrderId: stockMovements.purchaseOrderId,
      receivedQuantity: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::double precision`,
    })
    .from(stockMovements)
    .where(
      and(inArray(stockMovements.purchaseOrderId, [...purchaseOrderIds]), eq(stockMovements.movementType, 'receipt')),
    )
    .groupBy(stockMovements.purchaseOrderId, stockMovements.partId);

  return new Map(
    rows.flatMap((row) =>
      row.purchaseOrderId
        ? [[receivedQuantityKey(row.purchaseOrderId, row.partId), row.receivedQuantity] as const]
        : [],
    ),
  );
}

function receivedQuantityKey(purchaseOrderId: string, partId: string): string {
  return `${purchaseOrderId}:${partId}`;
}

/**
 * One order's receiving progress, read inside a caller's transaction. The close-short gate and the
 * projected `derivedStatus` share this so an order cannot be closed short of a remainder it hasn't
 * got.
 */
export async function loadPurchaseOrderProgress({
  db,
  id,
}: {
  db: PurchaseOrderDb;
  id: UUID;
}): Promise<PurchaseOrderProgress> {
  const [lines, receivedQuantities] = await Promise.all([
    db
      .select({ partId: purchaseOrderLines.partId, quantity: purchaseOrderLines.quantity })
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, id)),
    loadReceivedQuantities({ db, purchaseOrderIds: [id] }),
  ]);

  return derivePurchaseOrderProgress({
    lines,
    receivedByPartId: new Map(
      lines.map((line) => [line.partId, receivedQuantities.get(receivedQuantityKey(id, line.partId)) ?? 0]),
    ),
  });
}

/** One open line of a sent order: what is still owed on it, and the order it is owed by. */
export type OpenOrderLine = {
  expectedDeliveryDate: string | null;
  outstandingQuantity: number;
  partId: UUID;
  purchaseOrderCode: number;
  purchaseOrderId: UUID;
};

/**
 * Every line still owed by a Supplier, per Part (spec §3's "on order").
 *
 * The open set is `sent`, un-cancelled (`cancelled` replaces the stored `sent`, so the status test
 * covers it), and not closed short — closing short is exactly the assertion that a remainder is
 * never arriving, so it must stop counting as cover the moment it is made. Over-receipt floors at
 * zero per line: a line that took 12 against 10 owes nothing, and never negative cover to some
 * other line of the same Part.
 *
 * Ordered earliest-promised first, nulls last, so a caller's first line for a Part is the one worth
 * naming — "PO-0042, expected Thursday" beside the shortfall it covers.
 */
export async function loadOpenOrderLines({ db }: { db: PurchaseOrderDb }): Promise<OpenOrderLine[]> {
  const lines = await db
    .select({
      expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
      partId: purchaseOrderLines.partId,
      purchaseOrderCode: purchaseOrders.code,
      purchaseOrderId: purchaseOrders.id,
      quantity: purchaseOrderLines.quantity,
    })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId))
    .where(and(eq(purchaseOrders.status, 'sent'), isNull(purchaseOrders.closedShortAt)));

  const receivedQuantities = await loadReceivedQuantities({
    db,
    purchaseOrderIds: [...new Set(lines.map((line) => line.purchaseOrderId))],
  });

  return lines
    .flatMap((line) => {
      const received = receivedQuantities.get(receivedQuantityKey(line.purchaseOrderId, line.partId)) ?? 0;
      const outstandingQuantity = Math.max(0, line.quantity - received);

      return outstandingQuantity > 0 ? [{ ...line, outstandingQuantity }] : [];
    })
    .sort(compareOpenOrderLines);
}

function compareOpenOrderLines(left: OpenOrderLine, right: OpenOrderLine): number {
  return (
    compareNullableDateOnly(left.expectedDeliveryDate, right.expectedDeliveryDate) ||
    left.purchaseOrderCode - right.purchaseOrderCode
  );
}

/** The as-sent PDF of each order; amendments (#1055) add revisions, so the newest row is the current one. */
async function loadLatestDocumentIds({
  db,
  purchaseOrderIds,
}: {
  db: PurchaseOrderDb;
  purchaseOrderIds: readonly UUID[];
}): Promise<Map<string, string>> {
  if (purchaseOrderIds.length === 0) return new Map();

  const rows = await db
    .select({ id: documents.id, purchaseOrderId: documents.purchaseOrderId })
    .from(documents)
    .where(inArray(documents.purchaseOrderId, [...purchaseOrderIds]))
    .orderBy(desc(documents.createdAt), desc(documents.id));
  const latest = new Map<string, string>();

  for (const row of rows) {
    if (row.purchaseOrderId && !latest.has(row.purchaseOrderId)) latest.set(row.purchaseOrderId, row.id);
  }

  return latest;
}

export async function listPurchaseOrders({
  db,
  input,
}: {
  db: Db;
  input: PurchaseOrderListInput;
}): Promise<PurchaseOrderListResult> {
  const where = buildPurchaseOrderListWhere(db, input);
  const paging = getPaginationQueryOptions(input);
  const rows = await db.query.purchaseOrders.findMany({
    ...(paging.limit === undefined ? {} : { limit: paging.limit, offset: paging.offset }),
    orderBy: [getSortOrder(getPurchaseOrderSortColumn(input.sortBy), input.sortDirection), desc(purchaseOrders.id)],
    where,
    with: purchaseOrderWith,
  });
  const [[totalRow], documentIds, receivedQuantities] = await Promise.all([
    db.select({ value: count() }).from(purchaseOrders).where(where),
    loadLatestDocumentIds({ db, purchaseOrderIds: rows.map((row) => row.id) }),
    loadReceivedQuantities({ db, purchaseOrderIds: rows.map((row) => row.id) }),
  ]);
  const total = totalRow?.value ?? 0;
  const items = rows.map((row) => mapPurchaseOrder(row, documentIds.get(row.id) ?? null, receivedQuantities));

  return { items, nextCursor: getNextCursor({ count: items.length, cursor: input.cursor, total }), total };
}

/**
 * Saves a draft whole. Supplier, expected date, lines, and Job links are one editable aggregate, so
 * one transaction owns the cross-row rule DB checks cannot express — every line's Part must belong
 * to the order's Supplier — and one audit event records what actually changed.
 */
export async function savePurchaseOrderDraft({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PurchaseOrderSaveDraftInput;
}): Promise<PurchaseOrder> {
  return db.transaction((tx) => savePurchaseOrderDraftWithin({ actorUserId, db: tx, input }));
}

/** The draft save itself, inside a caller's transaction — see {@link createPurchaseOrderWithin}. */
export async function savePurchaseOrderDraftWithin({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: DatabaseTransaction;
  input: PurchaseOrderSaveDraftInput;
}): Promise<PurchaseOrder> {
  assertDraft(await lockPurchaseOrder(db, input.id));
  const before = await getPurchaseOrder({ db, id: input.id });
  // A Job link is a set membership, so a repeated id is the same link, not a second one. Collapsing
  // here keeps the existence check exact and makes a core caller that repeats one idempotent rather
  // than a unique-constraint failure; the router contract still refuses duplicates outright.
  const jobIds = [...new Set(input.jobIds)];

  await assertSupplierExists({ db, supplierId: input.supplierId });
  await assertLinePartsMatchSupplier({ db, lines: input.lines, supplierId: input.supplierId });
  await assertJobsExist({ db, jobIds });

  await db
    .update(purchaseOrders)
    .set({
      expectedDeliveryDate: input.expectedDeliveryDate,
      supplierId: input.supplierId,
      updatedAt: new Date(),
    })
    .where(eq(purchaseOrders.id, input.id));
  // Both child collections are rewritten wholesale; an empty list simply leaves the scope cleared.
  await db.delete(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, input.id));
  if (input.lines.length > 0) {
    await db.insert(purchaseOrderLines).values(
      input.lines.map((line) => ({
        partId: line.partId,
        purchaseOrderId: input.id,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
    );
  }

  await db.delete(purchaseOrderJobLinks).where(eq(purchaseOrderJobLinks.purchaseOrderId, input.id));
  if (jobIds.length > 0) {
    await db.insert(purchaseOrderJobLinks).values(jobIds.map((jobId) => ({ jobId, purchaseOrderId: input.id })));
  }

  const after = await getPurchaseOrder({ db, id: input.id });
  const changes = diffAuditUpdate(purchaseOrderDraftAuditDescriptor, before, after);
  if (changes) {
    await recordAuditUpdate({ actorUserId, after, changes, db, descriptor: purchaseOrderDraftAuditDescriptor });
  }

  return after;
}

export async function renderPurchaseOrderPreview({
  db,
  id,
  pdfRenderer,
}: {
  db: Db;
  id: UUID;
  pdfRenderer: PurchaseOrderPdfRenderer;
}): Promise<{ bytes: Uint8Array; filename: string }> {
  const purchaseOrder = await getPurchaseOrder({ db, id });
  if (purchaseOrder.lines.length === 0) throw new PurchaseOrderEmptyError(id);
  const filename = `${purchaseOrder.code}.pdf`;
  return { bytes: await pdfRenderer({ document: toPdfModel(purchaseOrder, new Date()), filename }), filename };
}

export async function markPurchaseOrderSent({
  actorUserId,
  db,
  id,
  pdfRenderer,
  storage,
}: {
  actorUserId: AuthId;
  db: Db;
  id: UUID;
  pdfRenderer: PurchaseOrderPdfRenderer;
  storage: StorageAdapter;
}): Promise<PurchaseOrder> {
  let uploadedDocumentStorageKey: string | null = null;

  try {
    return await db.transaction(async (tx) => {
      const before = await lockPurchaseOrder(tx, id);
      assertDraft(before);
      const purchaseOrder = await getPurchaseOrder({ db: tx, id });
      if (purchaseOrder.lines.length === 0) throw new PurchaseOrderEmptyError(id);
      assertLinesArePriced(purchaseOrder);

      const sentAt = new Date();
      const filename = `${purchaseOrder.code}.pdf`;
      const bytes = await pdfRenderer({ document: toPdfModel(purchaseOrder, sentAt), filename });
      const storageKey = `documents/purchase-order/${id}/${randomUUID()}-${sanitizeDocumentStorageKeySuffix(filename)}`;
      await createDocumentRecord({
        actorUserId,
        db: tx,
        input: {
          bytes,
          filename,
          metadata: { revision: 1, type: 'purchase_order' },
          ownerType: 'purchase_order',
          purchaseOrderId: id,
          storageKey,
        },
        storage,
      });
      // createDocumentRecord compensates its own savepoint failures; from here the outer transaction owns cleanup.
      uploadedDocumentStorageKey = storageKey;

      const [after] = await tx
        .update(purchaseOrders)
        .set({ sentAt, status: 'sent', updatedAt: sentAt })
        .where(eq(purchaseOrders.id, id))
        .returning();
      if (!after) throw new PurchaseOrderNotFoundError(id);
      const changes = diffAuditUpdate(purchaseOrderAuditDescriptor, before, after);
      if (changes) {
        await recordAuditUpdate({ actorUserId, after, changes, db: tx, descriptor: purchaseOrderAuditDescriptor });
      }
      return getPurchaseOrder({ db: tx, id });
    });
  } catch (error) {
    if (uploadedDocumentStorageKey) {
      try {
        await storage.deleteObject(uploadedDocumentStorageKey);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Failed to send Purchase Order and clean up its PDF');
      }
    }
    throw error;
  }
}

export async function cancelPurchaseOrder({
  actorUserId,
  db,
  id,
}: {
  actorUserId: AuthId;
  db: Db;
  id: UUID;
}): Promise<PurchaseOrder> {
  return mutateEntity({
    actorUserId,
    assert: async (tx, before) => {
      if (before.status === 'cancelled') throw new PurchaseOrderAlreadyCancelledError(id);
      const [receipt] = await tx
        .select({ id: stockMovements.id })
        .from(stockMovements)
        .where(eq(stockMovements.purchaseOrderId, id))
        .limit(1);
      if (receipt) throw new PurchaseOrderHasReceiptsError(id);
    },
    db,
    descriptor: purchaseOrderAuditDescriptor,
    id,
    notFound: () => new PurchaseOrderNotFoundError(id),
    project: (tx, row) => getPurchaseOrder({ db: tx, id: row.id }),
    set: () => ({ status: 'cancelled' as const, updatedAt: new Date() }),
    table: purchaseOrders,
  });
}

/**
 * Releases the open remainder of an order the Supplier will never finish. Close-short is an
 * assertion rather than a status value (spec §4): the stored status stays `sent` and this timestamp
 * is what the derived state and #1057's on-order figure read, so the order's own history is intact.
 */
export async function closePurchaseOrderShort({
  actorUserId,
  db,
  id,
}: {
  actorUserId: AuthId;
  db: Db;
  id: UUID;
}): Promise<PurchaseOrder> {
  return mutateEntity({
    actorUserId,
    // Asserted from the derived partially-received state: there has to be an open remainder to
    // release, and something already delivered to close short of.
    assert: async (tx, before) => {
      if (before.status !== 'sent') throw new PurchaseOrderNotSentError(id);
      if (before.closedShortAt !== null) throw new PurchaseOrderAlreadyClosedShortError(id);
      const progress = await loadPurchaseOrderProgress({ db: tx, id });
      if (progress === 'sent') throw new PurchaseOrderNoReceiptsError(id);
      if (progress === 'received') throw new PurchaseOrderFullyReceivedError(id);
    },
    db,
    descriptor: purchaseOrderAuditDescriptor,
    id,
    notFound: () => new PurchaseOrderNotFoundError(id),
    project: (tx, row) => getPurchaseOrder({ db: tx, id: row.id }),
    set: () => ({ closedShortAt: new Date(), updatedAt: new Date() }),
    table: purchaseOrders,
  });
}

export async function readPurchaseOrderDocument({
  db,
  documentId,
  purchaseOrderId,
  storage,
}: {
  db: Db;
  documentId: UUID;
  purchaseOrderId: UUID;
  storage: StorageAdapter;
}): Promise<ReadDocumentResult> {
  await getPurchaseOrder({ db, id: purchaseOrderId });
  const [row] = await db
    .select({
      ...documentBaseSelect,
      uploaderEmail: user.email,
      uploaderName: user.name,
    })
    .from(documents)
    .leftJoin(user, eq(documents.uploaderUserId, user.id))
    .where(and(eq(documents.id, documentId), eq(documents.purchaseOrderId, purchaseOrderId)))
    .limit(1);
  if (!row) throw new DocumentNotFoundError(documentId);
  return { document: mapDocumentSummary(row), object: await storage.get(row.storageKey) };
}

const purchaseOrderWith = {
  jobLinks: { with: { job: true } },
  lines: { with: { part: true } },
  supplier: true,
} as const;

async function loadPurchaseOrderAggregate({ db, id }: { db: PurchaseOrderDb; id: UUID }) {
  return db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id), with: purchaseOrderWith });
}

type PurchaseOrderAggregate = NonNullable<Awaited<ReturnType<typeof loadPurchaseOrderAggregate>>>;

function mapPurchaseOrder(
  row: PurchaseOrderAggregate,
  documentId: UUID | null,
  receivedQuantities: ReadonlyMap<string, number>,
): PurchaseOrder {
  const receivedByPartId = new Map(
    row.lines.map((line) => [line.partId, receivedQuantities.get(receivedQuantityKey(row.id, line.partId)) ?? 0]),
  );

  return PurchaseOrderSchema.parse({
    closedShortAt: row.closedShortAt,
    code: row.code,
    createdAt: row.createdAt,
    derivedStatus: derivePurchaseOrderStatus({
      closedShortAt: row.closedShortAt,
      lines: row.lines,
      receivedByPartId,
      status: row.status,
    }),
    documentId,
    expectedDeliveryDate: row.expectedDeliveryDate,
    id: row.id,
    jobs: row.jobLinks
      .map((link) => ({ code: link.job.code, id: link.job.id }))
      .sort((left, right) => left.code - right.code),
    lines: row.lines
      .map((line) => ({
        partCode: line.part.code,
        partId: line.partId,
        partName: line.part.name,
        quantity: line.quantity,
        receivedQuantity: receivedByPartId.get(line.partId) ?? 0,
        standardPurchaseLengthMm: line.part.standardPurchaseLengthMm,
        supplierCode: line.part.supplierCode,
        unitOfMeasure: line.part.unitOfMeasure,
        unitPrice: line.unitPrice,
      }))
      .sort((left, right) => left.partCode.localeCompare(right.partCode)),
    sentAt: row.sentAt,
    status: row.status,
    supplier: {
      address: row.supplier.address,
      companyName: row.supplier.companyName,
      contactPerson: row.supplier.contactPerson,
      email: row.supplier.email,
      id: row.supplier.id,
      phone: row.supplier.phone,
    },
    supplierId: row.supplierId,
    updatedAt: row.updatedAt,
  });
}

async function lockPurchaseOrder(tx: DatabaseTransaction, id: UUID): Promise<PurchaseOrderRow> {
  const [row] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for('update');
  if (!row) throw new PurchaseOrderNotFoundError(id);
  return row;
}

/**
 * A zero price on a draft line means "not priced yet" — that is how a line raised from the buy list
 * is written, since that screen is quantity-only under the cost gate. Sending is the assertion the
 * price was agreed (spec §4), and it is the last point before a receipt would stamp that zero onto
 * the ledger as the Part's cost.
 */
function assertLinesArePriced(purchaseOrder: PurchaseOrder): void {
  const unpriced = purchaseOrder.lines.find((line) => line.unitPrice === 0);
  if (unpriced) throw new PurchaseOrderLineNotPricedError(unpriced.partCode);
}

function assertDraft(row: PurchaseOrderRow): void {
  if (row.status !== 'draft') throw new PurchaseOrderNotDraftError(row.id);
}

async function assertSupplierExists({ db, supplierId }: { db: PurchaseOrderDb; supplierId: UUID }): Promise<void> {
  const [row] = await db
    .select({ id: supplier.id })
    .from(supplier)
    .where(and(eq(supplier.id, supplierId), isNull(supplier.deletedAt)))
    .limit(1)
    // Pair with removeSupplier's row lock so a supplier cannot be retired between validation and insertion.
    .for('key share');
  if (!row) throw new PurchaseOrderSupplierNotFoundError(supplierId);
}

async function assertLinePartsMatchSupplier({
  db,
  lines,
  supplierId,
}: {
  db: DatabaseTransaction;
  lines: PurchaseOrderSaveDraftInput['lines'];
  supplierId: UUID;
}): Promise<void> {
  if (lines.length === 0) return;
  const rows = await db
    .select({ id: parts.id, supplierId: parts.supplierId, unitOfMeasure: parts.unitOfMeasure })
    .from(parts)
    .where(
      inArray(
        parts.id,
        lines.map((line) => line.partId),
      ),
    )
    // Prevent a concurrent Part supplier change between validation and line insertion.
    .for('key share');
  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const line of lines) {
    const part = byId.get(line.partId);
    if (!part) throw new PurchaseOrderPartNotFoundError(line.partId);
    if (part.supplierId === null) throw new PurchaseOrderPartNotPurchasableError(line.partId);
    if (part.supplierId !== supplierId) throw new PurchaseOrderPartSupplierMismatchError(line.partId);
    if (!isWholeUnitQuantity(line.quantity, unitClassFor(part.unitOfMeasure))) {
      throw new PurchaseOrderInvalidQuantityError(line.partId);
    }
  }
}

async function assertJobsExist({ db, jobIds }: { db: DatabaseTransaction; jobIds: readonly UUID[] }): Promise<void> {
  if (jobIds.length === 0) return;
  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(inArray(jobs.id, [...jobIds]));

  if (rows.length !== jobIds.length) {
    const found = new Set(rows.map((row) => row.id));
    const missing = jobIds.find((id) => !found.has(id));
    if (missing) throw new JobNotFoundError(missing);
  }
}

function toPdfModel(purchaseOrder: PurchaseOrder, issueDate: Date): PurchaseOrderPdfModel {
  return {
    code: purchaseOrder.code,
    expectedDeliveryDate: purchaseOrder.expectedDeliveryDate,
    issueDate: DateIso.parse(issueDate),
    jobCodes: purchaseOrder.jobs.map((job) => job.code),
    lines: purchaseOrder.lines,
    supplier: purchaseOrder.supplier,
  };
}

function buildPurchaseOrderListWhere(db: Db, input: PurchaseOrderListInput): SQL | undefined {
  const conditions: SQL[] = [];
  if (input.status) conditions.push(eq(purchaseOrders.status, input.status));
  if (input.supplierId) conditions.push(eq(purchaseOrders.supplierId, input.supplierId));
  if (input.search) {
    const digits = input.search.trim().replace(/^PO-/i, '');
    const code = /^\d+$/.test(digits) ? Number.parseInt(digits, 10) : null;
    const supplierIds = dbSupplierIdsBySearch(db, input.search);
    const searchCondition = or(
      code ? eq(purchaseOrders.code, code) : undefined,
      inArray(purchaseOrders.supplierId, supplierIds),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  return conditions.length === 0 ? undefined : and(...conditions);
}

function dbSupplierIdsBySearch(db: Db, search: string) {
  return db
    .select({ id: supplier.id })
    .from(supplier)
    .where(and(createEscapedContainsSearchCondition(sql`${supplier.companyName}`, search), isNull(supplier.deletedAt)));
}

function getPurchaseOrderSortColumn(sortBy: PurchaseOrderListInput['sortBy']): SQLWrapper {
  if (sortBy === 'code') return purchaseOrders.code;
  if (sortBy === 'expectedDeliveryDate') return purchaseOrders.expectedDeliveryDate;
  if (sortBy === 'status') return purchaseOrders.status;
  if (sortBy === 'supplier') {
    return sql`(select ${supplier.companyName} from ${supplier} where ${supplier.id} = ${purchaseOrders.supplierId})`;
  }

  return purchaseOrders.createdAt;
}
