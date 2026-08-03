import {
  getStockMovementHistory,
  isStockMovementCoreError,
  JobCancelledError,
  JobNotFoundError,
  listJobStock,
  listJobs,
  listStockOnHand,
  postAdjustment,
  postJobMovement,
  postRevaluation,
  type StockMovementCoreError,
} from '@pkg/core';
import { getJobDisplayName } from '@pkg/domain';
import {
  InventoryJobOptionListInput,
  InventoryJobOptionListResult,
  JobStockInput,
  JobStockResult,
  PostAdjustmentInput,
  PostJobMovementInput,
  PostRevaluationInput,
  StockMovement,
  StockMovementCostFields,
  StockMovementHistoryInput,
  StockMovementHistoryResult,
  StockMovementHistoryRowCostFields,
  StockMovementPostResult,
  StockOnHandBucketCostFields,
  StockOnHandResult,
  StockOnHandRowCostFields,
} from '@pkg/schema';

import { assertNever, type CoreErrorMapping, createAuthTRPCError, mapKnownCoreError } from '../../trpc/errors.js';
import {
  authorizedProcedure,
  canReadInventoryCosts,
  type InventoryCostAccess,
  projectInventoryCostFields,
  router,
} from '../../trpc/init.js';

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
            costFields: StockOnHandRowCostFields,
            output: {
              ...row,
              buckets: row.buckets.map((bucket) =>
                projectInventoryCostFields({
                  access: ctx.access,
                  costFields: StockOnHandBucketCostFields,
                  output: bucket,
                }),
              ),
            },
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
            costFields: StockMovementHistoryRowCostFields,
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
      // The gate reads both ways: a price-blind poster may not seed an opening balance with a value.
      if (input.unitCost !== null && !canReadInventoryCosts(ctx.access)) {
        throw createAuthTRPCError({
          appCode: 'auth.forbidden',
          code: 'FORBIDDEN',
          message: 'You do not have permission to set inventory cost.',
        });
      }

      const movement = await mapStockMovementErrors(() =>
        postAdjustment({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      );

      return projectMovement(movement, ctx.access);
    }),

  postCheckout: authorizedProcedure('inventory:move')
    .input(PostJobMovementInput)
    .output(StockMovementPostResult)
    .mutation(async ({ ctx, input }) => {
      const result = await mapStockMovementErrors(() =>
        postJobMovement({ actorUserId: ctx.session.user.id, db: ctx.db, input, movementType: 'checkout' }),
      );

      return { ...result, movement: projectMovement(result.movement, ctx.access) };
    }),

  postReturnToStore: authorizedProcedure('inventory:move')
    .input(PostJobMovementInput)
    .output(StockMovementPostResult)
    .mutation(async ({ ctx, input }) => {
      const result = await mapStockMovementErrors(() =>
        postJobMovement({ actorUserId: ctx.session.user.id, db: ctx.db, input, movementType: 'return-to-store' }),
      );

      return { ...result, movement: projectMovement(result.movement, ctx.access) };
    }),

  postRevaluation: authorizedProcedure('inventory_cost:revalue')
    .input(PostRevaluationInput)
    .output(StockMovement)
    .mutation(async ({ ctx, input }) => {
      const movement = await mapStockMovementErrors(() =>
        postRevaluation({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      );

      return projectMovement(movement, ctx.access);
    }),
});

function projectMovement(movement: StockMovement, access: InventoryCostAccess) {
  return projectInventoryCostFields({ access, costFields: StockMovementCostFields, output: movement });
}

async function mapStockMovementErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(
    () => mapKnownCoreError(action, isStockMovementJobError, mapStockMovementJobError),
    isStockMovementCoreError,
    mapStockMovementCoreError,
  );
}

type StockMovementJobError = JobCancelledError | JobNotFoundError;

function isStockMovementJobError(error: unknown): error is StockMovementJobError {
  return error instanceof JobCancelledError || error instanceof JobNotFoundError;
}

function mapStockMovementJobError(error: StockMovementJobError): CoreErrorMapping<StockMovementJobError['code']> {
  switch (error.code) {
    case 'job.cancelled':
      return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
    case 'job.not_found':
      return { appCode: error.code, code: 'NOT_FOUND', message: 'Job not found.' };
    default:
      return assertNever(error);
  }
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
    case 'inventory.periodic_movement':
      return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
    default:
      return assertNever(error);
  }
}
