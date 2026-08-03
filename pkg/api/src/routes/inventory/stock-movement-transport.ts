import { isStockMovementCoreError, type StockMovementCoreError } from '@pkg/core';
import { type StockMovement, StockMovementCostFields } from '@pkg/schema';

import { assertNever, type CoreErrorMapping, createAuthTRPCError, mapKnownCoreError } from '../../trpc/errors.js';
import { canReadInventoryCosts, type InventoryCostAccess, projectInventoryCostFields } from '../../trpc/init.js';

/**
 * The ledger's transport rules, shared by every router that writes a movement — the inventory
 * surface and the Purchase Order receiving one — so a movement cannot mean two different things
 * depending on which endpoint posted it.
 */
export async function mapStockMovementErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isStockMovementCoreError, mapStockMovementCoreError);
}

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

function mapStockMovementCoreError(error: StockMovementCoreError): CoreErrorMapping<StockMovementCoreError['code']> {
  switch (error.code) {
    case 'inventory.part_not_found':
      return { appCode: error.code, code: 'NOT_FOUND', message: 'Part not found.' };
    case 'inventory.fabricated_part_cost':
    case 'inventory.invalid_delta':
    case 'inventory.invalid_length':
    case 'inventory.periodic_movement':
      return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
    default:
      return assertNever(error);
  }
}
