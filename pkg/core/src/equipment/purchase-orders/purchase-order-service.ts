import { randomUUID } from 'node:crypto';

import {
  auditEvents,
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
import {
  compareNullableDateOnly,
  derivePartStockActions,
  derivePurchaseOrderActions,
  derivePurchaseOrderProgress,
  derivePurchaseOrderStatus,
  type PurchaseOrderActionFacts,
} from '@pkg/domain';
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
  type PurchaseOrderReceiptBucket,
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
import { assertPartStockAction } from '../inventory/part-stock-action-errors.js';
import { JobNotFoundError } from '../jobs/job-errors.js';
import {
  assertPurchaseOrderAction,
  PurchaseOrderEmptyError,
  PurchaseOrderInvalidQuantityError,
  PurchaseOrderLineNotPricedError,
  PurchaseOrderNotFoundError,
  PurchaseOrderPartNotFoundError,
  PurchaseOrderPartNotPurchasableError,
  PurchaseOrderPartSupplierMismatchError,
  PurchaseOrderSupplierNotFoundError,
} from './purchase-order-errors.js';
import { loadReceiptBuckets, receiptBucketKey } from './receipt-pool.js';

type PurchaseOrderRow = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderDb = Db | DatabaseTransaction;

export const purchaseOrderAuditDescriptor = defineAuditDescriptor<PurchaseOrderRow>({
  entityId: (row) => row.id,
  entityType: 'purchase_order',
  label: (row) => formatPurchaseOrderCode(row.code),
  noun: 'Purchase Order',
  primaryLabelField: 'code',
  toRecord: (row) => ({
    approvedAt: row.approvedAt?.toISOString() ?? null,
    closedShortAt: row.closedShortAt?.toISOString() ?? null,
    code: formatPurchaseOrderCode(row.code),
    expectedDeliveryDate: row.expectedDeliveryDate,
    sentAt: row.sentAt?.toISOString() ?? null,
    status: row.status,
    supplierId: row.supplierId,
  }),
});

/** Audits the order aggregate: header fields alongside the lines and Job links it carries. */
export const purchaseOrderAggregateAuditDescriptor = defineAuditDescriptor<PurchaseOrder>({
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

  const [documentIds, receivedQuantities, linesWithMovements, receiptBuckets] = await Promise.all([
    loadLatestDocumentIds({ db, purchaseOrderIds: [id] }),
    loadReceivedQuantities({ db, purchaseOrderIds: [id] }),
    loadLinesWithStockMovements({ db, purchaseOrderIds: [id] }),
    loadReceiptBuckets({ db, purchaseOrderIds: [id] }),
  ]);

  return mapPurchaseOrder(
    aggregate,
    documentIds.get(id) ?? null,
    receivedQuantities,
    linesWithMovements,
    receiptBuckets,
  );
}

/**
 * The return reasons that leave the Supplier still owing the goods (spec §4). Sending back the
 * wrong item or a defective one re-opens the line's expectation, because a replacement is coming;
 * `order-error` is us admitting we asked for the wrong thing, and nothing is owed in its place.
 */
const REPLACEMENT_OWED_RETURN_REASONS = ['wrong-item', 'defective'] as const;

/**
 * What each order line has actually taken in and kept, keyed by the line's own composite identity.
 * The derived `partially received` / `received` states are read from this and never stored (§4), as
 * are the line's outstanding quantity and the plant's On Order figure.
 *
 * Receipts *less* the returns that owe a replacement: a line that took ten and sent all ten back as
 * defective is waiting on ten again, and every surface that asks what is still coming has to say so
 * — including the over-receipt warning, which would otherwise fire on the replacement delivery.
 */
export async function loadReceivedQuantities({
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
      and(
        inArray(stockMovements.purchaseOrderId, [...purchaseOrderIds]),
        // Return deltas are negative, so summing them alongside receipts nets the line down.
        or(
          eq(stockMovements.movementType, 'receipt'),
          and(
            eq(stockMovements.movementType, 'return-to-supplier'),
            inArray(stockMovements.reason, [...REPLACEMENT_OWED_RETURN_REASONS]),
          ),
        ),
      ),
    )
    .groupBy(stockMovements.purchaseOrderId, stockMovements.partId);

  return new Map(
    rows.flatMap((row) =>
      row.purchaseOrderId
        ? // Floored: an over-return posts by design (`exceeds-received` warns, never blocks), and a
          // line that sent back more than it took in has taken in nothing — not a negative amount,
          // which would inflate its outstanding quantity and the plant's On Order past what was ordered.
          [[receivedQuantityKey(row.purchaseOrderId, row.partId), Math.max(0, row.receivedQuantity)] as const]
        : [],
    ),
  );
}

/**
 * Every line of these orders that carries any stock movement at all, keyed like the received map.
 * Read alongside the received quantities because the two answer different questions: what a line has
 * kept, and whether it has any ledger rows a substitution would orphan.
 */
async function loadLinesWithStockMovements({
  db,
  purchaseOrderIds,
}: {
  db: PurchaseOrderDb;
  purchaseOrderIds: readonly UUID[];
}): Promise<Set<string>> {
  if (purchaseOrderIds.length === 0) return new Set();

  const rows = await db
    .selectDistinct({ partId: stockMovements.partId, purchaseOrderId: stockMovements.purchaseOrderId })
    .from(stockMovements)
    .where(inArray(stockMovements.purchaseOrderId, [...purchaseOrderIds]));

  return new Set(
    rows.flatMap((row) => (row.purchaseOrderId ? [receivedQuantityKey(row.purchaseOrderId, row.partId)] : [])),
  );
}

/**
 * Whether anything at all has moved against a line, receipts and returns alike.
 *
 * Distinct from what the line has *kept*: a fully returned line is owed ten again but still has
 * ledger rows pointing at `(purchaseOrderId, partId)`, and those rows are what a Part substitution
 * would orphan. This is the question the substitution guard has to ask.
 */
export async function lineHasStockMovements({
  db,
  partId,
  purchaseOrderId,
}: {
  db: PurchaseOrderDb;
  partId: UUID;
  purchaseOrderId: UUID;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: stockMovements.id })
    .from(stockMovements)
    .where(and(eq(stockMovements.purchaseOrderId, purchaseOrderId), eq(stockMovements.partId, partId)))
    .limit(1);

  return row !== undefined;
}

export function receivedQuantityKey(purchaseOrderId: string, partId: string): string {
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

/**
 * What the ledger says about one order, read once for the two gates that terminate it. Both judge
 * history by `hasAnyMovement` and only the remainder by `progress`, so an order can never refuse
 * cancelling *and* closing short for want of history — which is what stranded one whose receipts
 * had all gone back as replacement-owed returns: netted to nothing, it read `sent` and looked
 * untouched to close-short, while its rows were real enough to block cancelling.
 */
export type PurchaseOrderLedgerFacts = {
  /** Any row at all against the order, receipts and returns alike — the order's history exists. */
  hasAnyMovement: boolean;
  /** The netted projection: what the lines have kept, and so what remainder is still owed. */
  progress: PurchaseOrderProgress;
};

export async function loadPurchaseOrderLedgerFacts({
  db,
  id,
}: {
  db: PurchaseOrderDb;
  id: UUID;
}): Promise<PurchaseOrderLedgerFacts> {
  const [movement, progress] = await Promise.all([
    db.select({ id: stockMovements.id }).from(stockMovements).where(eq(stockMovements.purchaseOrderId, id)).limit(1),
    loadPurchaseOrderProgress({ db, id }),
  ]);

  return { hasAnyMovement: movement.length > 0, progress };
}

/**
 * The whole world an action verdict is judged against, read under whatever lock the caller already
 * holds. It is the ledger facts the termination rules read, plus the two stored facts and whether
 * the order has any lines at all — so every gate, not just cancel and close-short, asks one question.
 */
export async function loadPurchaseOrderActionFacts({
  db,
  row,
}: {
  db: PurchaseOrderDb;
  row: Pick<PurchaseOrderRow, 'closedShortAt' | 'id' | 'status'>;
}): Promise<PurchaseOrderActionFacts> {
  const [ledger, [lines]] = await Promise.all([
    loadPurchaseOrderLedgerFacts({ db, id: row.id }),
    db.select({ value: count() }).from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, row.id)),
  ]);

  return {
    closedShortAt: row.closedShortAt,
    hasAnyMovement: ledger.hasAnyMovement,
    isEmpty: (lines?.value ?? 0) === 0,
    progress: ledger.progress,
    status: row.status,
  };
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
 * naming — "PO-0042, expected Thursday" beside the shortfall it covers. `partIds` narrows the scan
 * for a caller that only wants a handful of Parts, without changing what any of them is owed.
 */
export async function loadOpenOrderLines({
  db,
  partIds,
}: {
  db: PurchaseOrderDb;
  partIds?: readonly UUID[];
}): Promise<OpenOrderLine[]> {
  // Narrowing by Part is exact: an open line belongs to exactly one Part, so dropping other Parts
  // cannot change what is owed on the ones asked for.
  const partScope = partIds === undefined ? undefined : [...partIds];
  if (partScope?.length === 0) return [];

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
    .where(
      and(
        eq(purchaseOrders.status, 'sent'),
        isNull(purchaseOrders.closedShortAt),
        partScope ? inArray(purchaseOrderLines.partId, partScope) : undefined,
      ),
    );

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

/**
 * The current PDF of each order: the newest revision, since an amendment files a further one rather
 * than replacing the as-sent original. Narrowed to the generated order PDFs — the credit notes that
 * share the collection are evidence filed *against* the order, never a rendering of it.
 */
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
    .where(and(inArray(documents.purchaseOrderId, [...purchaseOrderIds]), isPurchaseOrderPdf))
    .orderBy(newestPurchaseOrderDocumentFirst);
  const latest = new Map<string, string>();

  for (const row of rows) {
    if (row.purchaseOrderId && !latest.has(row.purchaseOrderId)) latest.set(row.purchaseOrderId, row.id);
  }

  return latest;
}

/** The generated order PDFs, as against the credit notes filed alongside them. */
export const isPurchaseOrderPdf = sql`${documents.metadata}->>'type' = 'purchase_order'`;

/**
 * Newest first, with the revision number breaking a tie rather than a random id. Two amendments
 * landing inside the same clock tick is rare and entirely possible, and "which PDF is current" is
 * not a question the order may answer differently on two reads — so every reader of the collection
 * shares this one ordering.
 */
export const newestPurchaseOrderDocumentFirst = sql`${documents.createdAt} desc, coalesce((${documents.metadata}->>'revision')::int, 0) desc, ${documents.id} desc`;

/** Where a Purchase-Order-owned document's bytes live. One shape for the PDFs and the credit notes. */
export function purchaseOrderDocumentStorageKey(purchaseOrderId: UUID, filename: string): string {
  return `documents/purchase-order/${purchaseOrderId}/${randomUUID()}-${sanitizeDocumentStorageKeySuffix(filename)}`;
}

/**
 * Renders one revision of an order and files it as a Purchase-Order-owned document.
 *
 * Both writers go through here — marking sent files revision 1, and every amendment files the next
 * — so the naming, the storage path and the metadata cannot drift apart between them. Documents are
 * immutable, so the as-sent original survives every amendment; the caller owns compensating for the
 * stored object if its transaction later fails, which is why the storage key comes back.
 */
export async function storePurchaseOrderPdfRevision({
  actorUserId,
  db,
  issuedAt,
  pdfRenderer,
  purchaseOrder,
  revision,
  storage,
}: {
  actorUserId: AuthId;
  db: DatabaseTransaction;
  issuedAt: Date;
  pdfRenderer: PurchaseOrderPdfRenderer;
  purchaseOrder: PurchaseOrder;
  revision: number;
  storage: StorageAdapter;
}): Promise<string> {
  const filename = revision === 1 ? `${purchaseOrder.code}.pdf` : `${purchaseOrder.code} rev ${revision}.pdf`;
  const lastModified = await loadPurchaseOrderLastModified({ db, id: purchaseOrder.id });
  const bytes = await pdfRenderer({ document: toPdfModel(purchaseOrder, issuedAt, lastModified, revision), filename });
  const storageKey = purchaseOrderDocumentStorageKey(purchaseOrder.id, filename);

  await createDocumentRecord({
    actorUserId,
    db,
    input: {
      bytes,
      filename,
      metadata: { revision, type: 'purchase_order' },
      ownerType: 'purchase_order',
      purchaseOrderId: purchaseOrder.id,
      storageKey,
    },
    storage,
  });

  return storageKey;
}

/** The revision an amendment's re-render becomes: one past the highest the order already holds. */
export async function loadNextPurchaseOrderRevision({
  db,
  purchaseOrderId,
}: {
  db: PurchaseOrderDb;
  purchaseOrderId: UUID;
}): Promise<number> {
  const [row] = await db
    .select({
      revision: sql<number>`coalesce(max((${documents.metadata}->>'revision')::int), 0)`,
    })
    .from(documents)
    .where(and(eq(documents.purchaseOrderId, purchaseOrderId), isPurchaseOrderPdf));

  return (row?.revision ?? 0) + 1;
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
  const [[totalRow], documentIds, receivedQuantities, linesWithMovements, receiptBuckets] = await Promise.all([
    db.select({ value: count() }).from(purchaseOrders).where(where),
    loadLatestDocumentIds({ db, purchaseOrderIds: rows.map((row) => row.id) }),
    loadReceivedQuantities({ db, purchaseOrderIds: rows.map((row) => row.id) }),
    loadLinesWithStockMovements({ db, purchaseOrderIds: rows.map((row) => row.id) }),
    loadReceiptBuckets({ db, purchaseOrderIds: rows.map((row) => row.id) }),
  ]);
  const total = totalRow?.value ?? 0;
  const items = rows.map((row) =>
    mapPurchaseOrder(row, documentIds.get(row.id) ?? null, receivedQuantities, linesWithMovements, receiptBuckets),
  );

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
  await lockPurchaseOrder(db, input.id);
  const before = await getPurchaseOrder({ db, id: input.id });
  // A sent order is amended, never edited whole — the log and its PDF revisions are how a change
  // after it went out is recorded.
  assertPurchaseOrderAction(before.actions.edit, input.id);
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
  const changes = diffAuditUpdate(purchaseOrderAggregateAuditDescriptor, before, after);
  if (changes) {
    await recordAuditUpdate({ actorUserId, after, changes, db, descriptor: purchaseOrderAggregateAuditDescriptor });
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
  const lastModified = await loadPurchaseOrderLastModified({ db, id });
  return {
    bytes: await pdfRenderer({ document: toPdfModel(purchaseOrder, new Date(), lastModified), filename }),
    filename,
  };
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
      const purchaseOrder = await getPurchaseOrder({ db: tx, id });
      // Draft-ness and having something on it are the order's own state; whether each line carries
      // an agreed price judges the lines themselves, so it stays here with the write that reads them.
      assertPurchaseOrderAction(purchaseOrder.actions.send, id);
      assertLinesArePriced(purchaseOrder);

      const sentAt = new Date();
      // The footer names the last person who edited the Supplier-facing order — approving and
      // sending are lifecycle moves the last-modified read skips — falling back to whoever created it.
      uploadedDocumentStorageKey = await storePurchaseOrderPdfRevision({
        actorUserId,
        db: tx,
        issuedAt: sentAt,
        pdfRenderer,
        purchaseOrder,
        revision: 1,
        storage,
      });

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

/**
 * The admin sign-off that clears a draft for sending. It locks the order the way sending does —
 * editing is draft-only — so the escape hatch is `revertPurchaseOrderToDraft` rather than a silent
 * revocation on edit. Who approved lives in the audit event, not in a column of its own.
 */
export async function approvePurchaseOrder({
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
      const actions = derivePurchaseOrderActions(await loadPurchaseOrderActionFacts({ db: tx, row: before }));
      assertPurchaseOrderAction(actions.approve, id);
    },
    db,
    descriptor: purchaseOrderAuditDescriptor,
    id,
    notFound: () => new PurchaseOrderNotFoundError(id),
    project: (tx, row) => getPurchaseOrder({ db: tx, id: row.id }),
    set: () => {
      const approvedAt = new Date();

      return { approvedAt, status: 'approved' as const, updatedAt: approvedAt };
    },
    table: purchaseOrders,
  });
}

/**
 * Un-approves an order that never went out, reopening it for editing. Gated by the same right as
 * approving — only someone who could sign it off may withdraw the signature — and audited, so the
 * withdrawn approval survives as history rather than disappearing with the timestamp.
 */
export async function revertPurchaseOrderToDraft({
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
      const actions = derivePurchaseOrderActions(await loadPurchaseOrderActionFacts({ db: tx, row: before }));
      assertPurchaseOrderAction(actions.revertToDraft, id);
    },
    db,
    descriptor: purchaseOrderAuditDescriptor,
    id,
    notFound: () => new PurchaseOrderNotFoundError(id),
    project: (tx, row) => getPurchaseOrder({ db: tx, id: row.id }),
    set: () => ({ approvedAt: null, status: 'draft' as const, updatedAt: new Date() }),
    table: purchaseOrders,
  });
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
    // Cancel reads `hasAnyMovement`: an order with history is closed short, never disowned.
    assert: async (tx, before) => {
      const actions = derivePurchaseOrderActions(await loadPurchaseOrderActionFacts({ db: tx, row: before }));
      assertPurchaseOrderAction(actions.cancel, id);
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
    // `hasAnyMovement` is the history to close short of — the same fact cancel reads — and
    // `progress` is the open remainder to release. Both come from the one derivation, so this can
    // never disagree with what the Close Short control offered.
    assert: async (tx, before) => {
      const actions = derivePurchaseOrderActions(await loadPurchaseOrderActionFacts({ db: tx, row: before }));
      assertPurchaseOrderAction(actions.closeShort, id);
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
  linesWithMovements: ReadonlySet<string>,
  receiptBuckets: ReadonlyMap<string, PurchaseOrderReceiptBucket[]>,
): PurchaseOrder {
  const receivedByPartId = new Map(
    row.lines.map((line) => [line.partId, receivedQuantities.get(receivedQuantityKey(row.id, line.partId)) ?? 0]),
  );
  return PurchaseOrderSchema.parse({
    // Reduced from the facts this read already loaded — no extra query — so the payload a surface
    // renders its controls from carries the same verdict the write gate will apply.
    actions: derivePurchaseOrderActions({
      closedShortAt: row.closedShortAt,
      hasAnyMovement: row.lines.some((line) => linesWithMovements.has(receivedQuantityKey(row.id, line.partId))),
      isEmpty: row.lines.length === 0,
      progress: derivePurchaseOrderProgress({ lines: row.lines, receivedByPartId }),
      status: row.status,
    }),
    approvedAt: row.approvedAt,
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
        hasStockMovements: linesWithMovements.has(receivedQuantityKey(row.id, line.partId)),
        partCode: line.part.code,
        partId: line.partId,
        partName: line.part.name,
        quantity: line.quantity,
        receiptBuckets: receiptBuckets.get(receiptBucketKey(row.id, line.partId)) ?? [],
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

/** What one line has taken in and kept — the floor a quantity amendment may never go below. */
export async function loadLineReceivedQuantity({
  db,
  partId,
  purchaseOrderId,
}: {
  db: PurchaseOrderDb;
  partId: UUID;
  purchaseOrderId: UUID;
}): Promise<number> {
  const received = await loadReceivedQuantities({ db, purchaseOrderIds: [purchaseOrderId] });

  return received.get(receivedQuantityKey(purchaseOrderId, partId)) ?? 0;
}

export async function lockPurchaseOrder(tx: DatabaseTransaction, id: UUID): Promise<PurchaseOrderRow> {
  const [row] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for('update');
  if (!row) throw new PurchaseOrderNotFoundError(id);
  return row;
}

/**
 * A zero price on a draft line means "not priced yet" — the state a never-costed Part still starts
 * in. Sending is the assertion the price was agreed (spec §4), and it is the last point before a
 * receipt would stamp that zero onto the ledger as the Part's cost.
 */
function assertLinesArePriced(purchaseOrder: PurchaseOrder): void {
  const unpriced = purchaseOrder.lines.find((line) => line.unitPrice === 0);
  if (unpriced) throw new PurchaseOrderLineNotPricedError(unpriced.partCode);
}

async function assertSupplierExists({ db, supplierId }: { db: PurchaseOrderDb; supplierId: UUID }): Promise<void> {
  const [row] = await db
    .select({ id: supplier.id })
    .from(supplier)
    .where(and(eq(supplier.id, supplierId), isNull(supplier.deletedAt)))
    .limit(1)
    // Pair with removeSupplier's row lock so a supplier cannot be retired between validation and insertion.
    .for('share');
  if (!row) throw new PurchaseOrderSupplierNotFoundError(supplierId);
}

/**
 * Every line's Part has to belong to the order's Supplier, be buyable at all, and be asked for in a
 * quantity its unit class allows. Shared with the amendment path: a line added or substituted onto
 * a sent order is held to exactly the rules a draft line is.
 */
export async function assertLinePartsMatchSupplier({
  db,
  lines,
  supplierId,
}: {
  db: DatabaseTransaction;
  lines: readonly { partId: UUID; quantity: number }[];
  supplierId: UUID;
}): Promise<void> {
  if (lines.length === 0) return;
  const rows = await db
    .select({
      id: parts.id,
      isInternallyFabricated: parts.isInternallyFabricated,
      stockTrackingMode: parts.stockTrackingMode,
      supplierId: parts.supplierId,
      unitOfMeasure: parts.unitOfMeasure,
    })
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
    assertPartStockAction(derivePartStockActions(part).purchase, { action: 'purchase', partId: line.partId });
    // The verdict reads the fabricated flag; `parts_supplier_or_bom` is what makes that the same
    // question as having a Supplier. Asked directly too, so a Part with neither still reads as
    // unbuyable rather than as belonging to some other Supplier.
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

/**
 * Who last changed what the Supplier is looking at. Lifecycle moves are skipped: approving, sending,
 * reverting and cancelling all record a `status` change and nothing the printed page shows, so the
 * footer keeps naming the last person who actually edited the order — falling back to whoever
 * created it when nobody has. Sending relies on this rather than on rendering before its own event.
 */
async function loadPurchaseOrderLastModified({
  db,
  id,
}: {
  db: PurchaseOrderDb;
  id: UUID;
}): Promise<PurchaseOrderPdfModel['lastModified']> {
  const [event] = await db
    .select({ actorName: user.name, occurredAt: auditEvents.occurredAt })
    .from(auditEvents)
    .leftJoin(user, eq(auditEvents.actorUserId, user.id))
    .where(
      and(
        eq(auditEvents.entityType, 'purchase_order'),
        eq(auditEvents.entityId, id),
        // Only lifecycle *updates* are skipped. Creation always survives as the floor, so an order
        // whose lines arrived with it still has someone to name. The parentheses are load-bearing:
        // `and()` brackets the group, not each condition, so a bare `OR` here would bind looser than
        // the entity filters and match every non-status event in the table.
        sql`(${auditEvents.action} <> 'updated' OR NOT coalesce(${auditEvents.changes} ? 'status', false))`,
      ),
    )
    .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
    .limit(1);
  if (!event) throw new Error(`Purchase Order ${id} has no audit history`);

  return { actorName: event.actorName, occurredAt: DateIso.parse(event.occurredAt) };
}

function toPdfModel(
  purchaseOrder: PurchaseOrder,
  issueDate: Date,
  lastModified: PurchaseOrderPdfModel['lastModified'],
  revision = 1,
): PurchaseOrderPdfModel {
  return {
    code: purchaseOrder.code,
    expectedDeliveryDate: purchaseOrder.expectedDeliveryDate,
    issueDate: DateIso.parse(issueDate),
    jobCodes: purchaseOrder.jobs.map((job) => job.code),
    lastModified,
    lines: purchaseOrder.lines,
    revision,
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
