import {
  getStockMovementHistory,
  JobCancelledError,
  JobNotFoundError,
  listJobStock,
  listJobs,
  listStockOnHand,
  postAdjustment,
  postJobMovement,
  postRevaluation,
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
  StockMovementHistoryInput,
  StockMovementHistoryResult,
  StockMovementHistoryRowCostFields,
  StockMovementPostResult,
  StockOnHandBucketCostFields,
  StockOnHandResult,
  StockOnHandRowCostFields,
} from '@pkg/schema';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, projectInventoryCostFields, router } from '../../trpc/init.js';
import { assertCanWriteInventoryCost, mapStockMovementErrors, projectMovement } from './stock-movement-transport.js';

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
      const result = await mapJobStockMovementErrors(() =>
        getStockMovementHistory({ db: ctx.db, partId: input.partId }),
      );

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
    .query(({ ctx, input }) => mapJobStockMovementErrors(() => listJobStock({ db: ctx.db, jobId: input.jobId }))),

  postAdjustment: authorizedProcedure('inventory:adjust')
    .input(PostAdjustmentInput)
    .output(StockMovement)
    .mutation(async ({ ctx, input }) => {
      assertCanWriteInventoryCost(ctx.access, input.unitCost);

      const movement = await mapJobStockMovementErrors(() =>
        postAdjustment({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      );

      return projectMovement(movement, ctx.access);
    }),

  postCheckout: authorizedProcedure('inventory:move')
    .input(PostJobMovementInput)
    .output(StockMovementPostResult)
    .mutation(async ({ ctx, input }) => {
      const result = await mapJobStockMovementErrors(() =>
        postJobMovement({ actorUserId: ctx.session.user.id, db: ctx.db, input, movementType: 'checkout' }),
      );

      return { ...result, movement: projectMovement(result.movement, ctx.access) };
    }),

  postReturnToStore: authorizedProcedure('inventory:move')
    .input(PostJobMovementInput)
    .output(StockMovementPostResult)
    .mutation(async ({ ctx, input }) => {
      const result = await mapJobStockMovementErrors(() =>
        postJobMovement({ actorUserId: ctx.session.user.id, db: ctx.db, input, movementType: 'return-to-store' }),
      );

      return { ...result, movement: projectMovement(result.movement, ctx.access) };
    }),

  postRevaluation: authorizedProcedure('inventory_cost:revalue')
    .input(PostRevaluationInput)
    .output(StockMovement)
    .mutation(async ({ ctx, input }) => {
      const movement = await mapJobStockMovementErrors(() =>
        postRevaluation({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      );

      return projectMovement(movement, ctx.access);
    }),
});

/** Job movements add the Job's own failures on top of the shared ledger rules. */
async function mapJobStockMovementErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapStockMovementErrors(() => mapKnownCoreError(action, isStockMovementJobError, mapStockMovementJobError));
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
