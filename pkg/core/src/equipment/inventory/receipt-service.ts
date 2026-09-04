import type { DatabaseTransaction, Db } from '@pkg/db';
import { purchaseOrderLines, purchaseOrders } from '@pkg/db/equipment';
import { deriveMovementWarnings, derivePurchaseOrderActions } from '@pkg/domain/equipment';
import type { AuthId, UUID } from '@pkg/schema';
import type { PostReceiptInput, StockMovementPostResult } from '@pkg/schema/equipment';
import { StockMovementPostResult as StockMovementPostResultSchema, unitClassFor } from '@pkg/schema/equipment';
import { and, eq } from 'drizzle-orm';

import {
  assertPurchaseOrderAction,
  PurchaseOrderLineNotFoundError,
  PurchaseOrderNotFoundError,
} from '../purchase-orders/purchase-order-errors.js';
import { loadLineReceivedQuantity, loadPurchaseOrderActionFacts } from '../purchase-orders/purchase-order-service.js';
import { insertMovement, loadStockPart } from './ledger.js';
import { resolveMovementActor } from './movement-actor.js';
import { assertDeltaMatchesUnitClass, assertLengthMatchesUnitClass } from './unit-class-rules.js';

/**
 * Receives stock against one open Purchase Order line. Receiving *is* the ledger write (spec §11):
 * the confirmed quantity, the line's own price, and the Part's standard purchase length become one
 * receipt row in one transaction — there is no post-the-receipt-later state to drift out of.
 *
 * The dock confirms quantities. `unitCost` is a desk-side correction the API gates on cost access;
 * left null the line price lands on the movement, which is why a price-blind receiver still posts a
 * correctly valued row. Periodic Parts receive like any other: receipts are one of the two things
 * their ledger ever records.
 *
 * `input.actorUserId` names the person at the shared tablet; absent it, the signed-in user is
 * stamped. See `resolveMovementActor`.
 */
export async function postReceipt({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PostReceiptInput;
}): Promise<StockMovementPostResult> {
  return db.transaction(async (tx) => {
    const part = await loadStockPart({ db: tx, lockForMovement: true, partId: input.partId });
    const movementActorUserId = await resolveMovementActor({
      assertedActorUserId: input.actorUserId,
      db: tx,
      sessionUserId: actorUserId,
    });
    const purchaseOrder = await lockReceivablePurchaseOrder(tx, input.purchaseOrderId);
    const line = await loadPurchaseOrderLine(tx, input.purchaseOrderId, input.partId);
    const unitClass = unitClassFor(part.unitOfMeasure);
    // A dock that keys nothing takes the length the Part is bought in; a short delivery keys its own.
    const lengthMm = unitClass === 'linear' ? (input.lengthMm ?? part.standardPurchaseLengthMm) : input.lengthMm;

    assertDeltaMatchesUnitClass(input.quantity, unitClass);
    assertLengthMatchesUnitClass(lengthMm, unitClass);

    // The same netted figure the order's own projection reads, so the dock's warning and the line's
    // outstanding quantity cannot disagree: stock returned as defective is owed again, and the
    // replacement delivery must not read as an over-receipt.
    const receivedQuantity = await loadLineReceivedQuantity({
      db: tx,
      partId: input.partId,
      purchaseOrderId: purchaseOrder.id,
    });
    const movement = await insertMovement(tx, {
      actorUserId: movementActorUserId,
      delta: input.quantity,
      lengthMm,
      movementType: 'receipt',
      partId: input.partId,
      purchaseOrderId: purchaseOrder.id,
      unitCost: input.unitCost ?? line.unitPrice,
    });

    return StockMovementPostResultSchema.parse({
      movement,
      warnings: deriveMovementWarnings({
        facts: { kind: 'receipt', orderedQuantity: line.quantity, receivedQuantity },
        quantity: input.quantity,
      }),
    });
  });
}

async function lockReceivablePurchaseOrder(tx: DatabaseTransaction, id: UUID) {
  const [row] = await tx
    .select({ closedShortAt: purchaseOrders.closedShortAt, id: purchaseOrders.id, status: purchaseOrders.status })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    // The same row lock cancel and close-short take, so a receipt cannot race either decision.
    .for('update');
  if (!row) throw new PurchaseOrderNotFoundError(id);
  // Read under the lock and judged by the one derivation: close-short asserted the remainder will
  // never come, and a later receipt would make that a lie.
  const actions = derivePurchaseOrderActions(await loadPurchaseOrderActionFacts({ db: tx, row }));
  assertPurchaseOrderAction(actions.receive, id);

  return row;
}

async function loadPurchaseOrderLine(tx: DatabaseTransaction, purchaseOrderId: UUID, partId: UUID) {
  const [line] = await tx
    .select({ quantity: purchaseOrderLines.quantity, unitPrice: purchaseOrderLines.unitPrice })
    .from(purchaseOrderLines)
    .where(and(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId), eq(purchaseOrderLines.partId, partId)));
  if (!line) throw new PurchaseOrderLineNotFoundError(purchaseOrderId, partId);

  return line;
}
