import type { JobStockMovementType, PartStockActions, PartStockActionVerdict, UUID } from '@pkg/schema';
import { PartNotBuiltError } from '../parts/part-bom-errors.js';
import { PurchaseOrderPartNotPurchasableError } from '../purchase-orders/purchase-order-errors.js';
import { BuildLinearPartError, BuildPeriodicPartError } from './build-errors.js';
import { FabricatedPartCostError, PeriodicStockMovementError } from './stock-movement-errors.js';

export type PartStockActionContext = {
  /**
   * The verdict being asserted, named. Every reason maps to one error except `periodic`, which a
   * build and a Job movement refuse in their own words — so the caller names what it read rather
   * than the mapping inferring it from which fields happened to be passed.
   */
  action: keyof PartStockActions;
  partId: UUID;
};

/** The movement a `periodic` refusal names, for the actions that post one. */
const PERIODIC_JOB_MOVEMENT: Partial<Record<keyof PartStockActions, JobStockMovementType>> = {
  checkout: 'checkout',
  returnToStore: 'return-to-store',
};

/**
 * Refuses a write the Part's own facts do not allow, in the words that write already used. The
 * verdict is derived once in `@pkg/domain` and read by both sides of the seam — the surfaces that
 * offer stock controls, and this gate — so a control can no longer offer an action the post then
 * refuses. The mapping is a lookup and nothing more: judgement lives in the derivation.
 */
export function assertPartStockAction(
  verdict: PartStockActionVerdict,
  { action, partId }: PartStockActionContext,
): void {
  if (verdict.allowed) return;

  switch (verdict.reason) {
    case 'built-part':
      throw new PurchaseOrderPartNotPurchasableError(partId);
    case 'cost-derived':
      throw new FabricatedPartCostError();
    case 'linear':
      throw new BuildLinearPartError(partId);
    case 'not-built':
      throw new PartNotBuiltError(partId);
    case 'periodic': {
      const movement = PERIODIC_JOB_MOVEMENT[action];

      throw movement === undefined ? new BuildPeriodicPartError(partId) : new PeriodicStockMovementError(movement);
    }
  }
}
