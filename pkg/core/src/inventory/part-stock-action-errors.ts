import type { JobStockMovementType, PartStockActionVerdict, UUID } from '@pkg/schema';
import { PartNotBuiltError } from '../parts/part-bom-errors.js';
import { PurchaseOrderPartNotPurchasableError } from '../purchase-orders/purchase-order-errors.js';
import { BuildLinearPartError, BuildPeriodicPartError } from './build-errors.js';
import { FabricatedPartCostError, PeriodicStockMovementError } from './stock-movement-errors.js';

export type PartStockActionContext = {
  /**
   * The Job movement being posted, when the action is one. A periodic Part is refused in the words
   * of the write that asked: a build says it is counted rather than built, a draw names the movement
   * its ledger does not record.
   */
  movement?: JobStockMovementType;
  partId: UUID;
};

/**
 * Refuses a write the Part's own facts do not allow, in the words that write already used. The
 * verdict is derived once in `@pkg/domain` and read by both sides of the seam — the surfaces that
 * offer stock controls, and this gate — so a control can no longer offer an action the post then
 * refuses. The mapping is a lookup and nothing more: judgement lives in the derivation.
 */
export function assertPartStockAction(verdict: PartStockActionVerdict, context: PartStockActionContext): void {
  if (verdict.allowed) return;

  const { movement, partId } = context;

  switch (verdict.reason) {
    case 'built-part':
      throw new PurchaseOrderPartNotPurchasableError(partId);
    case 'cost-derived':
      throw new FabricatedPartCostError();
    case 'linear':
      throw new BuildLinearPartError(partId);
    case 'not-built':
      throw new PartNotBuiltError(partId);
    case 'periodic':
      throw movement === undefined ? new BuildPeriodicPartError(partId) : new PeriodicStockMovementError(movement);
  }
}
