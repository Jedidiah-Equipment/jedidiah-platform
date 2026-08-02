import {
  getStockMovementHistory,
  isStockMovementCoreError,
  listStockOnHand,
  postAdjustment,
  postRevaluation,
  type StockMovementCoreError,
} from '@pkg/core';
import { hasPermission } from '@pkg/domain';
import {
  PostAdjustmentInput,
  PostRevaluationInput,
  StockMovement,
  StockMovementHistoryInput,
  StockMovementHistoryResult,
  StockOnHandResult,
} from '@pkg/schema';

import { assertNever, type CoreErrorMapping, createAuthTRPCError, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, projectInventoryCostFields, router } from '../../trpc/init.js';

export const inventoryRouter = router({
  stockOnHand: authorizedProcedure('inventory:read')
    .output(StockOnHandResult)
    .query(async ({ ctx }) => {
      const result = await listStockOnHand({ db: ctx.db });

      return {
        items: result.items.map((row) =>
          projectInventoryCostFields({
            access: ctx.access,
            costFields: ['averageUnitCost', 'totalValue'],
            output: row,
          }),
        ),
      };
    }),

  history: authorizedProcedure('inventory:read')
    .input(StockMovementHistoryInput)
    .output(StockMovementHistoryResult)
    .query(async ({ ctx, input }) => {
      const result = await mapStockMovementErrors(() => getStockMovementHistory({ db: ctx.db, partId: input.partId }));

      return {
        ...result,
        items: result.items.map((row) =>
          projectInventoryCostFields({
            access: ctx.access,
            costFields: ['movementValue', 'unitCost'],
            output: row,
          }),
        ),
      };
    }),

  postAdjustment: authorizedProcedure('inventory:adjust')
    .input(PostAdjustmentInput)
    .output(StockMovement)
    .mutation(async ({ ctx, input }) => {
      if (input.unitCost !== null && !hasPermission(ctx.access, 'inventory_cost:read')) {
        throw createAuthTRPCError({
          appCode: 'auth.forbidden',
          code: 'FORBIDDEN',
          message: 'You do not have permission to set inventory cost.',
        });
      }

      const movement = await mapStockMovementErrors(() =>
        postAdjustment({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      );

      return projectInventoryCostFields({ access: ctx.access, costFields: ['unitCost'], output: movement });
    }),

  postRevaluation: authorizedProcedure('inventory_cost:revalue')
    .input(PostRevaluationInput)
    .output(StockMovement)
    .mutation(async ({ ctx, input }) => {
      const movement = await mapStockMovementErrors(() =>
        postRevaluation({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      );

      return projectInventoryCostFields({ access: ctx.access, costFields: ['unitCost'], output: movement });
    }),
});

async function mapStockMovementErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isStockMovementCoreError, mapStockMovementCoreError);
}

function mapStockMovementCoreError(error: StockMovementCoreError): CoreErrorMapping<StockMovementCoreError['code']> {
  switch (error.code) {
    case 'inventory.fabricated_part_cost':
      return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
    case 'inventory.part_not_found':
      return { appCode: error.code, code: 'NOT_FOUND', message: 'Part not found.' };
    case 'inventory.invalid_delta':
      return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
    case 'inventory.invalid_length':
      return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
    case 'inventory.periodic_adjustment':
      return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
    default:
      return assertNever(error);
  }
}
