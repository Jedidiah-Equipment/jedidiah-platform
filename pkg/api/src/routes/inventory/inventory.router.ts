import {
  getStockMovementHistory,
  isStockMovementCoreError,
  listJobStock,
  listJobs,
  listStockOnHand,
  postAdjustment,
  postCheckout,
  postReturnToStore,
  postRevaluation,
  type StockMovementCoreError,
} from '@pkg/core';
import { getJobDisplayName, hasPermission } from '@pkg/domain';
import {
  InventoryJobOptionListInput,
  InventoryJobOptionListResult,
  JobStockInput,
  JobStockResult,
  PostAdjustmentInput,
  PostCheckoutInput,
  PostReturnToStoreInput,
  PostRevaluationInput,
  StockMovement,
  StockMovementHistoryInput,
  StockMovementHistoryResult,
  StockMovementPostResult,
  StockOnHandResult,
} from '@pkg/schema';

import { assertNever, type CoreErrorMapping, createAuthTRPCError, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, projectInventoryCostFields, router } from '../../trpc/init.js';

export const inventoryRouter = router({
  jobOptions: authorizedProcedure('inventory:move')
    .input(InventoryJobOptionListInput)
    .output(InventoryJobOptionListResult)
    .query(async ({ ctx, input }) => {
      const result = await listJobs({ db: ctx.db, input: { ...input, columnFilters: {}, filters: {} } });
      return {
        ...result,
        items: result.items.map((job) => ({
          code: job.code,
          displayName: getJobDisplayName(job),
          id: job.id,
        })),
      };
    }),

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

  jobStock: authorizedProcedure('inventory:read')
    .input(JobStockInput)
    .output(JobStockResult)
    .query(({ ctx, input }) => mapStockMovementErrors(() => listJobStock({ db: ctx.db, jobId: input.jobId }))),

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

  postCheckout: authorizedProcedure('inventory:move')
    .input(PostCheckoutInput)
    .output(StockMovementPostResult)
    .mutation(async ({ ctx, input }) => {
      const result = await mapStockMovementErrors(() =>
        postCheckout({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      );

      return {
        ...result,
        movement: projectInventoryCostFields({
          access: ctx.access,
          costFields: ['unitCost'],
          output: result.movement,
        }),
      };
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

  postReturnToStore: authorizedProcedure('inventory:move')
    .input(PostReturnToStoreInput)
    .output(StockMovementPostResult)
    .mutation(async ({ ctx, input }) => {
      const result = await mapStockMovementErrors(() =>
        postReturnToStore({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      );

      return {
        ...result,
        movement: projectInventoryCostFields({
          access: ctx.access,
          costFields: ['unitCost'],
          output: result.movement,
        }),
      };
    }),
});

async function mapStockMovementErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isStockMovementCoreError, mapStockMovementCoreError);
}

function mapStockMovementCoreError(error: StockMovementCoreError): CoreErrorMapping<StockMovementCoreError['code']> {
  switch (error.code) {
    case 'inventory.cancelled_job':
      return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
    case 'inventory.fabricated_part_cost':
      return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
    case 'inventory.job_not_found':
      return { appCode: error.code, code: 'NOT_FOUND', message: 'Job not found.' };
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
