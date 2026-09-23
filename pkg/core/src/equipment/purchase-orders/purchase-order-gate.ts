import type { DatabaseTransaction } from '@pkg/db';
import { purchaseOrderLines, purchaseOrders } from '@pkg/db/equipment';
import { derivePurchaseOrderActions, purchaseOrderActionFacts } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import type { PurchaseOrderActionName, PurchaseOrderActions } from '@pkg/schema/equipment';
import { eq } from 'drizzle-orm';
import { PurchaseOrderActionRefusedError, PurchaseOrderNotFoundError } from './purchase-order-errors.js';
import { loadLineIntake, type PurchaseOrderLineIntake } from './purchase-order-line-intake.js';

type PurchaseOrderRow = typeof purchaseOrders.$inferSelect;

/** What every order-level write reads: the locked row, its verdicts, and the intake it was judged on. */
export type OpenedPurchaseOrder = {
  actions: PurchaseOrderActions;
  intake: PurchaseOrderLineIntake;
  row: PurchaseOrderRow;
};

/**
 * Locks the order, judges it, and refuses unless `action` is allowed: the one gate every order-level
 * write passes. The row lock is the one cancel, close-short, receiving and returning all take, so no
 * two of them can race each other's judgement.
 */
export async function openPurchaseOrder(
  tx: DatabaseTransaction,
  id: UUID,
  action: PurchaseOrderActionName,
): Promise<OpenedPurchaseOrder> {
  const [row] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for('update');
  if (!row) throw new PurchaseOrderNotFoundError(id);
  return judgePurchaseOrder(tx, row, action);
}

/** The same judgement for a write already holding the row under `mutateEntity`'s lock. */
export async function judgePurchaseOrder(
  tx: DatabaseTransaction,
  row: PurchaseOrderRow,
  action: PurchaseOrderActionName,
): Promise<OpenedPurchaseOrder> {
  const [lines, intake] = await Promise.all([
    tx
      .select({ id: purchaseOrderLines.id, quantity: purchaseOrderLines.quantity })
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, row.id)),
    loadLineIntake({ db: tx, purchaseOrderIds: [row.id] }),
  ]);
  const actions = derivePurchaseOrderActions(purchaseOrderActionFacts({ row, lines, intake }));
  const verdict = actions[action];
  if (!verdict.allowed) throw new PurchaseOrderActionRefusedError(action, verdict.reason, row.id);
  return { actions, intake, row };
}
