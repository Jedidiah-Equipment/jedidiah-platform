import type { DatabaseTransaction, Db } from '@pkg/db';
import { purchaseOrderLines, purchaseOrders, stockMovements } from '@pkg/db/equipment';
import {
  deriveMovementWarnings,
  deriveOutstandingReceiptUnitCost,
  derivePurchaseOrderActions,
} from '@pkg/domain/equipment';
import type { AuthId, UUID } from '@pkg/schema';
import type { PostReturnToSupplierInput, StockMovementPostResult } from '@pkg/schema/equipment';
import { StockMovementPostResult as StockMovementPostResultSchema, unitClassFor } from '@pkg/schema/equipment';
import { and, asc, eq, inArray } from 'drizzle-orm';

import {
  assertPurchaseOrderAction,
  PurchaseOrderLineNotFoundError,
  PurchaseOrderNotFoundError,
} from '../purchase-orders/purchase-order-errors.js';
import { loadPurchaseOrderActionFacts } from '../purchase-orders/purchase-order-service.js';
import { RECEIPT_POOL_MOVEMENT_TYPES } from '../purchase-orders/receipt-pool.js';
import { bucketMatches, insertMovement, loadStockPart } from './ledger.js';
import { resolveMovementActor } from './movement-actor.js';
import { assertDeltaMatchesUnitClass, assertLengthMatchesUnitClass } from './unit-class-rules.js';

/**
 * Sends stock back to the Supplier off one received Purchase Order line (spec §4).
 *
 * The value is never keyed: it comes off the stamped receipts the line already holds, replayed as a
 * pool so a line received twice at different prices reverses at their quantity-weighted average.
 * That is what keeps the Part's moving average undisturbed — the quantity leaving is worth exactly
 * what it was worth arriving, so nothing about the stock still on the shelf changes.
 *
 * Returning more than the line ever took in is almost always a scan error, so it warns loudly and
 * posts anyway (spec §3): the stock physically left the building, and refusing the row would only
 * hide that. A closed-short order still takes returns — closing short says nothing more is *coming*,
 * not that what already arrived is beyond question.
 *
 * A periodic Part returns like any other. Its ledger bars *consumption*, and this is not that: a
 * return reverses an arrival, and the arrival is one of the two things a periodic ledger records.
 */
export async function postReturnToSupplier({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PostReturnToSupplierInput;
}): Promise<StockMovementPostResult> {
  return db.transaction(async (tx) => {
    const part = await loadStockPart({ db: tx, lockForMovement: true, partId: input.partId });
    const movementActorUserId = await resolveMovementActor({
      assertedActorUserId: input.actorUserId,
      db: tx,
      sessionUserId: actorUserId,
    });
    const purchaseOrder = await lockReturnablePurchaseOrder(tx, input.purchaseOrderId);
    await assertPurchaseOrderLineExists(tx, input.purchaseOrderId, input.partId);
    const unitClass = unitClassFor(part.unitOfMeasure);
    // A return keys nothing for a Part bought in one standard length; a short piece keys its own.
    const lengthMm = unitClass === 'linear' ? (input.lengthMm ?? part.standardPurchaseLengthMm) : input.lengthMm;

    assertDeltaMatchesUnitClass(input.quantity, unitClass);
    assertLengthMatchesUnitClass(lengthMm, unitClass);

    const poolMovements = await tx
      .select({ delta: stockMovements.delta, unitCost: stockMovements.unitCost })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.purchaseOrderId, purchaseOrder.id),
          eq(stockMovements.partId, input.partId),
          bucketMatches(lengthMm),
          inArray(stockMovements.movementType, [...RECEIPT_POOL_MOVEMENT_TYPES]),
        ),
      )
      .orderBy(asc(stockMovements.createdAt), asc(stockMovements.id));
    const outstandingReceivedQuantity = poolMovements.reduce((total, movement) => total + movement.delta, 0);

    const movement = await insertMovement(tx, {
      actorUserId: movementActorUserId,
      delta: -input.quantity,
      lengthMm,
      movementType: 'return-to-supplier',
      note: input.note,
      partId: input.partId,
      purchaseOrderId: purchaseOrder.id,
      reason: input.reason,
      unitCost: deriveOutstandingReceiptUnitCost(poolMovements, input.quantity),
    });

    return StockMovementPostResultSchema.parse({
      movement,
      warnings: deriveMovementWarnings({
        facts: { kind: 'return-to-supplier', outstandingReceivedQuantity },
        quantity: input.quantity,
      }),
    });
  });
}

async function lockReturnablePurchaseOrder(tx: DatabaseTransaction, id: UUID) {
  const [row] = await tx
    .select({ closedShortAt: purchaseOrders.closedShortAt, id: purchaseOrders.id, status: purchaseOrders.status })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    // The same row lock receiving takes, so a return cannot race a receipt onto the same line.
    .for('update');
  if (!row) throw new PurchaseOrderNotFoundError(id);
  // Returning deliberately outlives close-short, and that difference from receiving is now one
  // named verdict rather than a check this function happens not to make.
  const actions = derivePurchaseOrderActions(await loadPurchaseOrderActionFacts({ db: tx, row }));
  assertPurchaseOrderAction(actions.returnToSupplier, id);

  return row;
}

async function assertPurchaseOrderLineExists(
  tx: DatabaseTransaction,
  purchaseOrderId: UUID,
  partId: UUID,
): Promise<void> {
  const [line] = await tx
    .select({ partId: purchaseOrderLines.partId })
    .from(purchaseOrderLines)
    .where(and(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId), eq(purchaseOrderLines.partId, partId)));
  if (!line) throw new PurchaseOrderLineNotFoundError(purchaseOrderId, partId);
}
