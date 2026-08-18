import { type Db, parts, supplier } from '@pkg/db';
import { defaultPurchaseOrderUnitPrice, derivePartStockActions } from '@pkg/domain';
import type { AuthId, PurchaseOrderSelectionInput, PurchaseOrderSelectionResult, UUID } from '@pkg/schema';
import {
  isWholeUnitQuantity,
  PurchaseOrderSelectionResult as PurchaseOrderSelectionResultSchema,
  unitClassFor,
} from '@pkg/schema';
import { eq, inArray } from 'drizzle-orm';
import { loadMovingAverages } from '../inventory/ledger.js';
import { assertPartStockAction } from '../inventory/part-stock-action-errors.js';
import {
  PurchaseOrderInvalidQuantityError,
  PurchaseOrderPartNotFoundError,
  PurchaseOrderPartNotPurchasableError,
} from './purchase-order-errors.js';
import { createPurchaseOrderWithin, savePurchaseOrderDraftWithin } from './purchase-order-service.js';

type SupplierGroup = {
  lines: { partId: UUID; quantity: number; unitPrice: number }[];
  supplierName: string;
};

/**
 * Turns a ticked selection into drafts, one per Supplier (spec §4).
 *
 * The selection is supplier-blind on purpose: procurement ticks what the shop is short of, and the
 * split into orders is arithmetic nobody should have to do by hand. Ticked on a Job, every draft
 * links back to it, so the PDF reaches that Job's documents tab whichever Supplier it went to.
 *
 * Lines start from the current moving average. The draft stays editable because marking the
 * order sent, not this historical default, is what asserts the Supplier price was agreed.
 *
 * One transaction covers every draft: a selection spanning three Suppliers either becomes three
 * drafts or none, never a partial set the buyer has to reconcile against what they ticked.
 */
export async function createPurchaseOrderDraftsFromSelection({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PurchaseOrderSelectionInput;
}): Promise<PurchaseOrderSelectionResult> {
  const groups = await groupSelectionBySupplier({ db, input });

  return db.transaction(async (tx) => {
    const created: PurchaseOrderSelectionResult['purchaseOrders'] = [];

    for (const [supplierId, group] of groups) {
      // Supplier existence (and retirement) is the create's own check, taken under its row lock.
      const draft = await createPurchaseOrderWithin({
        actorUserId,
        db: tx,
        input: { expectedDeliveryDate: null, supplierId },
      });
      const saved = await savePurchaseOrderDraftWithin({
        actorUserId,
        db: tx,
        input: {
          expectedDeliveryDate: null,
          id: draft.id,
          jobIds: input.jobId === null ? [] : [input.jobId],
          lines: group.lines,
          supplierId,
        },
      });

      created.push({ code: saved.code, id: saved.id, supplierName: group.supplierName });
    }

    return PurchaseOrderSelectionResultSchema.parse({ purchaseOrders: created });
  });
}

/**
 * The whole selection judged before a single draft exists, so an unpurchasable Part fails the
 * request rather than the third order in it. Groups come out ordered by Supplier name, which is the
 * order the buyer is told about them in.
 */
async function groupSelectionBySupplier({
  db,
  input,
}: {
  db: Db;
  input: PurchaseOrderSelectionInput;
}): Promise<Array<[UUID, SupplierGroup]>> {
  const partRows = await db
    .select({
      id: parts.id,
      isInternallyFabricated: parts.isInternallyFabricated,
      stockTrackingMode: parts.stockTrackingMode,
      standardPurchaseLengthMm: parts.standardPurchaseLengthMm,
      supplierId: parts.supplierId,
      supplierName: supplier.companyName,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(parts)
    .leftJoin(supplier, eq(supplier.id, parts.supplierId))
    .where(
      inArray(
        parts.id,
        input.lines.map((line) => line.partId),
      ),
    );
  const partsById = new Map(partRows.map((row) => [row.id, row]));
  const averages = await loadMovingAverages(
    db,
    input.lines.map((line) => line.partId),
  );
  const bySupplier = new Map<UUID, SupplierGroup>();

  for (const line of input.lines) {
    const part = partsById.get(line.partId);
    if (!part) throw new PurchaseOrderPartNotFoundError(line.partId);
    assertPartStockAction(derivePartStockActions(part).purchase, { action: 'purchase', partId: line.partId });
    // The Supplier is left-joined on a column the purchasable verdict has already vouched for; this
    // narrows the pair the group is keyed and named by.
    if (part.supplierId === null || part.supplierName === null) {
      throw new PurchaseOrderPartNotPurchasableError(line.partId);
    }
    if (!isWholeUnitQuantity(line.quantity, unitClassFor(part.unitOfMeasure))) {
      throw new PurchaseOrderInvalidQuantityError(line.partId);
    }

    const group = bySupplier.get(part.supplierId) ?? { lines: [], supplierName: part.supplierName };
    group.lines.push({
      partId: line.partId,
      quantity: line.quantity,
      unitPrice: defaultPurchaseOrderUnitPrice({
        averageUnitCost: averages.get(line.partId) ?? null,
        standardPurchaseLengthMm: part.standardPurchaseLengthMm,
      }),
    });
    bySupplier.set(part.supplierId, group);
  }

  return [...bySupplier].sort(([, left], [, right]) => left.supplierName.localeCompare(right.supplierName));
}
