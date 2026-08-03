import { type StockMovement, StockMovementCostFields } from '@pkg/schema';

import { createAuthTRPCError } from '../../trpc/errors.js';
import { canReadInventoryCosts, type InventoryCostAccess, projectInventoryCostFields } from '../../trpc/init.js';

/**
 * The ledger's transport rules, shared by every router that writes a movement — the inventory
 * surface and the Purchase Order receiving one — so a movement cannot mean two different things
 * depending on which endpoint posted it. The error side lives in `inventory-error-families.ts`.
 */

export function projectMovement(movement: StockMovement, access: InventoryCostAccess) {
  return projectInventoryCostFields({ access, costFields: StockMovementCostFields, output: movement });
}

/** The gate reads both ways: a price-blind poster may not put a cost on the ledger either. */
export function assertCanWriteInventoryCost(access: InventoryCostAccess, unitCost: number | null): void {
  if (unitCost === null || canReadInventoryCosts(access)) return;

  throw createAuthTRPCError({
    appCode: 'auth.forbidden',
    code: 'FORBIDDEN',
    message: 'You do not have permission to set inventory cost.',
  });
}
