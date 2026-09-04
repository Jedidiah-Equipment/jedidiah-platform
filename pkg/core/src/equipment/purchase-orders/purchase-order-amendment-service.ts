import { type DatabaseTransaction, type Db, user } from '@pkg/db';
import { parts, purchaseOrderAmendments, purchaseOrderLines, purchaseOrders } from '@pkg/db/equipment';
import type { AuthId, UUID } from '@pkg/schema';
import type {
  PurchaseOrder,
  PurchaseOrderAmendAddLineInput,
  PurchaseOrderAmendExpectedDateInput,
  PurchaseOrderAmendmentListResult,
  PurchaseOrderAmendQuantityInput,
  PurchaseOrderAmendSubstitutePartInput,
  PurchaseOrderPdfRenderer,
} from '@pkg/schema/equipment';
import { PurchaseOrderAmendmentListResult as PurchaseOrderAmendmentListResultSchema } from '@pkg/schema/equipment';
import { aliasedTable, and, asc, eq } from 'drizzle-orm';
import type { StorageAdapter } from '../../storage/storage-adapter.js';
import { diffAuditUpdate, recordAuditUpdate } from '../audit/audit-service.js';
import {
  assertPurchaseOrderAction,
  PurchaseOrderAmendmentBelowReceivedError,
  PurchaseOrderLineExistsError,
  PurchaseOrderLineNotFoundError,
  PurchaseOrderLineNotPricedError,
  PurchaseOrderSubstitutionHasReceiptsError,
} from './purchase-order-errors.js';
import {
  assertLinePartsMatchSupplier,
  getPurchaseOrder,
  lineHasStockMovements,
  loadLineReceivedQuantity,
  loadNextPurchaseOrderRevision,
  lockPurchaseOrder,
  purchaseOrderAggregateAuditDescriptor,
  storePurchaseOrderPdfRevision,
} from './purchase-order-service.js';

/**
 * What a sent Purchase Order takes instead of an edit (spec §4).
 *
 * A draft is one freely editable aggregate; the moment it goes out, the Supplier is holding a
 * promise, and the only honest way to change it is to record the call that changed it. So an
 * amendment applies its change to the order *and* appends an insert-only log row
 * in one transaction, then re-renders the order as a further PDF revision the buyer can send on.
 * The as-sent original is never replaced — that is what makes the log readable as history rather
 * than as the only surviving account of what was agreed.
 */

type AmendmentRow = typeof purchaseOrderAmendments.$inferInsert;
type AmendmentChange = Pick<AmendmentRow, 'kind' | 'note'> &
  Partial<
    Pick<AmendmentRow, 'newExpectedDate' | 'newPartId' | 'newQuantity' | 'oldExpectedDate' | 'oldQuantity' | 'partId'>
  >;

/** Records the Supplier's revised promise date on the sent order and its immutable history. */
export async function amendPurchaseOrderExpectedDate({
  actorUserId,
  db,
  input,
  pdfRenderer,
  storage,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PurchaseOrderAmendExpectedDateInput;
  pdfRenderer: PurchaseOrderPdfRenderer;
  storage: StorageAdapter;
}): Promise<PurchaseOrder> {
  return applyAmendment({ actorUserId, db, id: input.id, pdfRenderer, storage }, async (tx, purchaseOrder) => {
    await tx
      .update(purchaseOrders)
      .set({ expectedDeliveryDate: input.expectedDeliveryDate, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, input.id));

    return {
      kind: 'expected-date-change',
      newExpectedDate: input.expectedDeliveryDate,
      note: input.note,
      oldExpectedDate: purchaseOrder.expectedDeliveryDate,
    };
  });
}

/** Moves a line's quantity, either way — the short delivery agreed by phone, or the extra ordered. */
export async function amendPurchaseOrderQuantity({
  actorUserId,
  db,
  input,
  pdfRenderer,
  storage,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PurchaseOrderAmendQuantityInput;
  pdfRenderer: PurchaseOrderPdfRenderer;
  storage: StorageAdapter;
}): Promise<PurchaseOrder> {
  return applyAmendment({ actorUserId, db, id: input.id, pdfRenderer, storage }, async (tx, purchaseOrder) => {
    const line = findLine(purchaseOrder, input.partId);
    await assertLinePartsMatchSupplier({
      db: tx,
      lines: [{ partId: input.partId, quantity: input.quantity }],
      supplierId: purchaseOrder.supplierId,
    });
    // Receipts are facts. An order asking for less than it has already taken in describes nothing.
    const receivedQuantity = await loadLineReceivedQuantity({
      db: tx,
      partId: input.partId,
      purchaseOrderId: input.id,
    });
    if (input.quantity < receivedQuantity) {
      throw new PurchaseOrderAmendmentBelowReceivedError(line.partCode, receivedQuantity);
    }

    await tx
      .update(purchaseOrderLines)
      .set({ quantity: input.quantity })
      .where(and(eq(purchaseOrderLines.purchaseOrderId, input.id), eq(purchaseOrderLines.partId, input.partId)));

    return {
      kind: 'quantity-change',
      newQuantity: input.quantity,
      note: input.note,
      oldQuantity: line.quantity,
      partId: input.partId,
    };
  });
}

/** Adds what the order should have carried all along, rather than raising a supplementary order. */
export async function amendPurchaseOrderAddLine({
  actorUserId,
  db,
  input,
  pdfRenderer,
  storage,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PurchaseOrderAmendAddLineInput;
  pdfRenderer: PurchaseOrderPdfRenderer;
  storage: StorageAdapter;
}): Promise<PurchaseOrder> {
  return applyAmendment({ actorUserId, db, id: input.id, pdfRenderer, storage }, async (tx, purchaseOrder) => {
    assertPartIsNotOnOrder(purchaseOrder, input.partId);
    await assertLinePartsMatchSupplier({
      db: tx,
      lines: [{ partId: input.partId, quantity: input.quantity }],
      supplierId: purchaseOrder.supplierId,
    });
    await assertLineIsPriced(tx, input.partId, input.unitPrice);

    await tx.insert(purchaseOrderLines).values({
      partId: input.partId,
      purchaseOrderId: input.id,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
    });

    return {
      kind: 'add-line',
      newQuantity: input.quantity,
      note: input.note,
      oldQuantity: null,
      partId: input.partId,
    };
  });
}

/**
 * Swaps one Part on a line for another the Supplier is sending instead.
 *
 * Only valid on a line nothing has arrived against. Receipts reference their line by the composite
 * `(purchaseOrderId, partId)` key, so substituting under them would orphan the arrival — the
 * foreign key would refuse it anyway, and this makes the refusal a rule with a reason rather than a
 * constraint violation surfacing from three layers down.
 */
export async function amendPurchaseOrderSubstitutePart({
  actorUserId,
  db,
  input,
  pdfRenderer,
  storage,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PurchaseOrderAmendSubstitutePartInput;
  pdfRenderer: PurchaseOrderPdfRenderer;
  storage: StorageAdapter;
}): Promise<PurchaseOrder> {
  return applyAmendment({ actorUserId, db, id: input.id, pdfRenderer, storage }, async (tx, purchaseOrder) => {
    const line = findLine(purchaseOrder, input.partId);
    await assertSubstitutionHasNoReceipts(tx, purchaseOrder, input.partId, line.partCode);
    assertPartIsNotOnOrder(purchaseOrder, input.newPartId);
    await assertLinePartsMatchSupplier({
      db: tx,
      lines: [{ partId: input.newPartId, quantity: input.quantity }],
      supplierId: purchaseOrder.supplierId,
    });
    await assertLineIsPriced(tx, input.newPartId, input.unitPrice);

    await tx
      .delete(purchaseOrderLines)
      .where(and(eq(purchaseOrderLines.purchaseOrderId, input.id), eq(purchaseOrderLines.partId, input.partId)));
    await tx.insert(purchaseOrderLines).values({
      partId: input.newPartId,
      purchaseOrderId: input.id,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
    });

    return {
      kind: 'substitute-part',
      newPartId: input.newPartId,
      newQuantity: input.quantity,
      note: input.note,
      oldQuantity: line.quantity,
      partId: input.partId,
    };
  });
}

/** An order's amendment history, oldest first — the account of how it got from as-sent to now. */
export async function listPurchaseOrderAmendments({
  db,
  purchaseOrderId,
}: {
  db: Db;
  purchaseOrderId: UUID;
}): Promise<PurchaseOrderAmendmentListResult> {
  await getPurchaseOrder({ db, id: purchaseOrderId });
  const newParts = aliasedTable(parts, 'new_parts');
  const rows = await db
    .select({
      actorName: user.name,
      actorUserId: purchaseOrderAmendments.actorUserId,
      createdAt: purchaseOrderAmendments.createdAt,
      id: purchaseOrderAmendments.id,
      kind: purchaseOrderAmendments.kind,
      newExpectedDate: purchaseOrderAmendments.newExpectedDate,
      newPartCode: newParts.code,
      newPartId: purchaseOrderAmendments.newPartId,
      newPartName: newParts.name,
      newQuantity: purchaseOrderAmendments.newQuantity,
      note: purchaseOrderAmendments.note,
      oldExpectedDate: purchaseOrderAmendments.oldExpectedDate,
      oldQuantity: purchaseOrderAmendments.oldQuantity,
      partCode: parts.code,
      partId: purchaseOrderAmendments.partId,
      partName: parts.name,
    })
    .from(purchaseOrderAmendments)
    .leftJoin(parts, eq(parts.id, purchaseOrderAmendments.partId))
    .innerJoin(user, eq(user.id, purchaseOrderAmendments.actorUserId))
    .leftJoin(newParts, eq(newParts.id, purchaseOrderAmendments.newPartId))
    .where(eq(purchaseOrderAmendments.purchaseOrderId, purchaseOrderId))
    .orderBy(asc(purchaseOrderAmendments.createdAt), asc(purchaseOrderAmendments.id));

  return PurchaseOrderAmendmentListResultSchema.parse({ items: rows });
}

/**
 * The transaction every amendment shares: lock the order, prove it is amendable, apply the caller's
 * change, log it, and re-render. The re-render is inside the same transaction so an order can never
 * end up amended with no PDF a buyer could actually send.
 */
async function applyAmendment(
  {
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
  },
  apply: (tx: DatabaseTransaction, purchaseOrder: PurchaseOrder) => Promise<AmendmentChange>,
): Promise<PurchaseOrder> {
  let uploadedDocumentStorageKey: string | null = null;

  try {
    return await db.transaction(async (tx) => {
      await lockPurchaseOrder(tx, id);
      const before = await getPurchaseOrder({ db: tx, id });
      // Drafts stay log-free: they are edited whole through the draft save, which is why an empty
      // log reads as "unchanged since it went out" rather than "we did not record anything". And
      // closing short asserted the remainder is not coming, so amending it would take that back.
      assertPurchaseOrderAction(before.actions.amend, id);
      const amendment = await apply(tx, before);

      await tx.insert(purchaseOrderAmendments).values({
        ...amendment,
        actorUserId,
        purchaseOrderId: id,
      });

      const amended = await getPurchaseOrder({ db: tx, id });
      const auditChanges = diffAuditUpdate(purchaseOrderAggregateAuditDescriptor, before, amended);
      if (auditChanges) {
        await recordAuditUpdate({
          actorUserId,
          after: amended,
          changes: auditChanges,
          db: tx,
          descriptor: purchaseOrderAggregateAuditDescriptor,
        });
      }

      uploadedDocumentStorageKey = await storePurchaseOrderPdfRevision({
        actorUserId,
        db: tx,
        issuedAt: new Date(),
        pdfRenderer,
        purchaseOrder: amended,
        revision: await loadNextPurchaseOrderRevision({ db: tx, purchaseOrderId: id }),
        storage,
      });

      // Re-read so the caller gets the revision it just filed as the order's current document.
      return getPurchaseOrder({ db: tx, id });
    });
  } catch (error) {
    if (uploadedDocumentStorageKey) {
      try {
        await storage.deleteObject(uploadedDocumentStorageKey);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Failed to amend Purchase Order and clean up its PDF');
      }
    }

    throw error;
  }
}

function findLine(purchaseOrder: PurchaseOrder, partId: UUID) {
  const line = purchaseOrder.lines.find((candidate) => candidate.partId === partId);
  if (!line) throw new PurchaseOrderLineNotFoundError(purchaseOrder.id, partId);

  return line;
}

/** A Part appears once per order, so an add or a substitution has to bring one that is not on it. */
function assertPartIsNotOnOrder(purchaseOrder: PurchaseOrder, partId: UUID): void {
  const existing = purchaseOrder.lines.find((line) => line.partId === partId);
  if (existing) throw new PurchaseOrderLineExistsError(existing.partCode);
}

/**
 * A zero price would stamp a zero onto the ledger as the Part's cost at the next receipt, which is
 * exactly what sending an order asserts has been agreed (see {@link PurchaseOrderLineNotPricedError}).
 * An amendment goes out to the Supplier the same way, so it is held to the same assertion.
 */
async function assertLineIsPriced(tx: DatabaseTransaction, partId: UUID, unitPrice: number): Promise<void> {
  if (unitPrice > 0) return;
  const [part] = await tx.select({ code: parts.code }).from(parts).where(eq(parts.id, partId));

  throw new PurchaseOrderLineNotPricedError(part?.code ?? partId);
}

/**
 * Asked of the ledger rather than of what the line still holds: a line that took ten and sent all
 * ten back is owed ten again, but both the receipts and the returns still point at
 * `(purchaseOrderId, partId)`, and swapping the Part would orphan them.
 */
async function assertSubstitutionHasNoReceipts(
  tx: DatabaseTransaction,
  purchaseOrder: PurchaseOrder,
  partId: UUID,
  partCode: string,
): Promise<void> {
  const hasMovements = await lineHasStockMovements({ db: tx, partId, purchaseOrderId: purchaseOrder.id });
  if (hasMovements) throw new PurchaseOrderSubstitutionHasReceiptsError(partCode);
}
