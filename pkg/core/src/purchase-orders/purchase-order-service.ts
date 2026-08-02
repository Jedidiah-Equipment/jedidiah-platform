import { randomUUID } from 'node:crypto';

import {
  createEscapedContainsSearchCondition,
  type DatabaseTransaction,
  type Db,
  documents,
  getPaginationQueryOptions,
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
  type AuthId,
  DateIso,
  formatPurchaseOrderCode,
  getNextCursor,
  type PurchaseOrder,
  type PurchaseOrderCreateInput,
  type PurchaseOrderListInput,
  type PurchaseOrderListResult,
  type PurchaseOrderPdfModel,
  type PurchaseOrderPdfRenderer,
  type PurchaseOrderReplaceJobLinksInput,
  type PurchaseOrderReplaceLinesInput,
  PurchaseOrder as PurchaseOrderSchema,
  type PurchaseOrderUpdateHeaderInput,
  type UUID,
  unitClassFor,
} from '@pkg/schema';
import { and, asc, count, desc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';

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
  PurchaseOrderEmptyError,
  PurchaseOrderHasReceiptsError,
  PurchaseOrderInvalidQuantityError,
  PurchaseOrderNotDraftError,
  PurchaseOrderNotFoundError,
  PurchaseOrderPartNotFoundError,
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
    code: formatPurchaseOrderCode(row.code),
    expectedDeliveryDate: row.expectedDeliveryDate,
    sentAt: row.sentAt?.toISOString() ?? null,
    status: row.status,
    supplierId: row.supplierId,
  }),
});

const purchaseOrderCollectionAuditDescriptor = defineAuditDescriptor<PurchaseOrder>({
  entityId: (purchaseOrder) => purchaseOrder.id,
  entityType: 'purchase_order',
  label: (purchaseOrder) => purchaseOrder.code,
  noun: 'Purchase Order',
  primaryLabelField: 'code',
  toRecord: () => ({}),
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
  return db.transaction(async (tx) => {
    await assertSupplierExists({ db: tx, supplierId: input.supplierId });
    const [row] = await tx
      .insert(purchaseOrders)
      .values({ expectedDeliveryDate: input.expectedDeliveryDate, supplierId: input.supplierId })
      .returning();
    if (!row) throw new Error('Purchase Order insert did not return a row');

    await recordAuditCreate({ actorUserId, db: tx, descriptor: purchaseOrderAuditDescriptor, input: row });
    return getPurchaseOrder({ db: tx, id: row.id });
  });
}

export async function getPurchaseOrder({ db, id }: { db: PurchaseOrderDb; id: UUID }): Promise<PurchaseOrder> {
  const aggregate = await loadPurchaseOrderAggregate({ db, id });
  if (!aggregate) throw new PurchaseOrderNotFoundError(id);

  const [document] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.purchaseOrderId, id))
    .orderBy(desc(documents.createdAt), desc(documents.id))
    .limit(1);

  return mapPurchaseOrder(aggregate, document?.id ?? null);
}

export async function listPurchaseOrders({
  db,
  input,
}: {
  db: Db;
  input: PurchaseOrderListInput;
}): Promise<PurchaseOrderListResult> {
  const where = buildPurchaseOrderListWhere(db, input);
  const orderBy = getPurchaseOrderListOrder(input);
  const paging = getPaginationQueryOptions(input);
  const rows = await db.query.purchaseOrders.findMany({
    ...(paging.limit === undefined ? {} : { limit: paging.limit, offset: paging.offset }),
    orderBy: [orderBy, desc(purchaseOrders.id)],
    where,
    with: purchaseOrderWith,
  });
  const [totalRow] = await db.select({ value: count() }).from(purchaseOrders).where(where);
  const ids = rows.map((row) => row.id);
  const documentRows =
    ids.length === 0
      ? []
      : await db
          .select({ id: documents.id, purchaseOrderId: documents.purchaseOrderId })
          .from(documents)
          .where(inArray(documents.purchaseOrderId, ids))
          .orderBy(desc(documents.createdAt), desc(documents.id));
  const documentIdByPurchaseOrder = new Map<string, string>();
  for (const row of documentRows) {
    if (row.purchaseOrderId && !documentIdByPurchaseOrder.has(row.purchaseOrderId)) {
      documentIdByPurchaseOrder.set(row.purchaseOrderId, row.id);
    }
  }
  const total = totalRow?.value ?? 0;
  const items = rows.map((row) => mapPurchaseOrder(row, documentIdByPurchaseOrder.get(row.id) ?? null));

  return { items, nextCursor: getNextCursor({ count: items.length, cursor: input.cursor, total }), total };
}

export async function updatePurchaseOrderHeader({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PurchaseOrderUpdateHeaderInput;
}): Promise<PurchaseOrder> {
  return mutateEntity({
    actorUserId,
    assert: async (tx, before) => {
      assertDraft(before);
      await assertSupplierExists({ db: tx, supplierId: input.supplierId });
      const [mismatched] = await tx
        .select({ partId: purchaseOrderLines.partId })
        .from(purchaseOrderLines)
        .innerJoin(parts, eq(purchaseOrderLines.partId, parts.id))
        .where(and(eq(purchaseOrderLines.purchaseOrderId, input.id), sql`${parts.supplierId} <> ${input.supplierId}`))
        .limit(1);
      if (mismatched) throw new PurchaseOrderPartSupplierMismatchError(mismatched.partId);
    },
    db,
    descriptor: purchaseOrderAuditDescriptor,
    id: input.id,
    notFound: () => new PurchaseOrderNotFoundError(input.id),
    project: (tx, row) => getPurchaseOrder({ db: tx, id: row.id }),
    set: () => ({
      expectedDeliveryDate: input.expectedDeliveryDate,
      supplierId: input.supplierId,
      updatedAt: new Date(),
    }),
    table: purchaseOrders,
  });
}

export async function replacePurchaseOrderLines({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PurchaseOrderReplaceLinesInput;
}): Promise<PurchaseOrder> {
  return db.transaction(async (tx) => {
    const purchaseOrder = await lockPurchaseOrder(tx, input.id);
    assertDraft(purchaseOrder);
    const before = await getPurchaseOrder({ db: tx, id: input.id });
    await validateLineParts({ db: tx, input, supplierId: purchaseOrder.supplierId });

    await tx.delete(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, input.id));
    if (input.lines.length > 0) {
      await tx.insert(purchaseOrderLines).values(
        input.lines.map((line) => ({
          partId: line.partId,
          purchaseOrderId: input.id,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      );
    }
    await tx.update(purchaseOrders).set({ updatedAt: new Date() }).where(eq(purchaseOrders.id, input.id));

    const after = await getPurchaseOrder({ db: tx, id: input.id });
    const changes = diffAuditUpdate(purchaseOrderCollectionAuditDescriptor, before, after);
    if (changes) {
      await recordAuditUpdate({
        actorUserId,
        after,
        changes,
        db: tx,
        descriptor: purchaseOrderCollectionAuditDescriptor,
      });
    }
    return after;
  });
}

export async function replacePurchaseOrderJobLinks({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PurchaseOrderReplaceJobLinksInput;
}): Promise<PurchaseOrder> {
  return db.transaction(async (tx) => {
    const purchaseOrder = await lockPurchaseOrder(tx, input.id);
    assertDraft(purchaseOrder);
    const before = await getPurchaseOrder({ db: tx, id: input.id });
    const jobRows =
      input.jobIds.length === 0
        ? []
        : await tx.select({ id: jobs.id }).from(jobs).where(inArray(jobs.id, input.jobIds));
    if (jobRows.length !== input.jobIds.length) {
      const found = new Set(jobRows.map((row) => row.id));
      throw new JobNotFoundError(input.jobIds.find((id) => !found.has(id)) ?? input.id);
    }

    await tx.delete(purchaseOrderJobLinks).where(eq(purchaseOrderJobLinks.purchaseOrderId, input.id));
    if (input.jobIds.length > 0) {
      await tx
        .insert(purchaseOrderJobLinks)
        .values(input.jobIds.map((jobId) => ({ jobId, purchaseOrderId: input.id })));
    }
    await tx.update(purchaseOrders).set({ updatedAt: new Date() }).where(eq(purchaseOrders.id, input.id));
    const after = await getPurchaseOrder({ db: tx, id: input.id });
    const changes = diffAuditUpdate(purchaseOrderCollectionAuditDescriptor, before, after);
    if (changes) {
      await recordAuditUpdate({
        actorUserId,
        after,
        changes,
        db: tx,
        descriptor: purchaseOrderCollectionAuditDescriptor,
      });
    }
    return after;
  });
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

function mapPurchaseOrder(row: PurchaseOrderAggregate, documentId: UUID | null): PurchaseOrder {
  return PurchaseOrderSchema.parse({
    code: row.code,
    createdAt: row.createdAt,
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

async function validateLineParts({
  db,
  input,
  supplierId,
}: {
  db: DatabaseTransaction;
  input: PurchaseOrderReplaceLinesInput;
  supplierId: UUID;
}) {
  if (input.lines.length === 0) return;
  const rows = await db
    .select({ id: parts.id, supplierId: parts.supplierId, unitOfMeasure: parts.unitOfMeasure })
    .from(parts)
    .where(
      inArray(
        parts.id,
        input.lines.map((line) => line.partId),
      ),
    )
    // Prevent a concurrent Part supplier change between validation and line insertion.
    .for('key share');
  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const line of input.lines) {
    const part = byId.get(line.partId);
    if (!part) throw new PurchaseOrderPartNotFoundError(line.partId);
    if (part.supplierId !== supplierId) throw new PurchaseOrderPartSupplierMismatchError(line.partId);
    if (unitClassFor(part.unitOfMeasure) !== 'measured' && !Number.isInteger(line.quantity)) {
      throw new PurchaseOrderInvalidQuantityError(line.partId);
    }
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

function getPurchaseOrderListOrder(input: PurchaseOrderListInput): SQL {
  const column =
    input.sortBy === 'code'
      ? purchaseOrders.code
      : input.sortBy === 'expectedDeliveryDate'
        ? purchaseOrders.expectedDeliveryDate
        : input.sortBy === 'status'
          ? purchaseOrders.status
          : input.sortBy === 'supplier'
            ? sql`(select ${supplier.companyName} from ${supplier} where ${supplier.id} = ${purchaseOrders.supplierId})`
            : purchaseOrders.createdAt;
  return input.sortDirection === 'asc' ? asc(column) : desc(column);
}
