import {
  type BuildError,
  closeOutJob,
  getStockMovementHistory,
  isBuildError,
  isJobCloseOutError,
  isPartBomError,
  isPartCoreError,
  JobCancelledError,
  type JobCloseOutError,
  JobNotFoundError,
  listCloseOutQueue,
  listJobStock,
  listJobs,
  listStockOnHand,
  type PartBomError,
  type PartCoreError,
  postAdjustment,
  postBuild,
  postJobMovement,
  postRevaluation,
} from '@pkg/core';
import { getJobDisplayName } from '@pkg/domain';
import {
  BuildPostResult,
  CloseOutJobInput,
  CloseOutQueueResult,
  InventoryJobOptionListInput,
  InventoryJobOptionListResult,
  JobCloseOut,
  JobStockInput,
  JobStockResult,
  PostAdjustmentInput,
  PostBuildInput,
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

  closeOutQueue: authorizedProcedure('inventory:close-out')
    .output(CloseOutQueueResult)
    .query(({ ctx }) => listCloseOutQueue({ db: ctx.db })),

  closeOutJob: authorizedProcedure('inventory:close-out')
    .input(CloseOutJobInput)
    .output(JobCloseOut)
    .mutation(({ ctx, input }) =>
      mapJobStockMovementErrors(() => closeOutJob({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  postBuild: authorizedProcedure('inventory:build')
    .input(PostBuildInput)
    .output(BuildPostResult)
    .mutation(({ ctx, input }) =>
      mapBuildErrors(() => postBuild({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

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

/**
 * Job movements and close-out add the Job's own failures on top of the shared ledger rules. Both
 * carry the close-out vocabulary: a draw against a closed-out Job is refused the same way a second
 * close is.
 */
async function mapJobStockMovementErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapStockMovementErrors(() =>
    mapKnownCoreError(
      () =>
        mapKnownCoreError(
          () => mapKnownCoreError(action, isStockMovementJobError, mapStockMovementJobError),
          isBuildError,
          mapBuildError,
        ),
      isJobCloseOutError,
      mapJobCloseOutError,
    ),
  );
}

/**
 * A build's own failures, plus the Part failures it raises reaching for its Built Part and
 * components. It shares the ledger rules but none of the Job or close-out vocabulary.
 */
async function mapBuildErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapStockMovementErrors(() =>
    mapKnownCoreError(
      () =>
        mapKnownCoreError(
          () => mapKnownCoreError(action, isBuildError, mapBuildError),
          isPartBomError,
          mapPartBomError,
        ),
      isPartCoreError,
      mapPartCoreError,
    ),
  );
}

function mapPartBomError(error: PartBomError): CoreErrorMapping<PartBomError['code']> {
  switch (error.code) {
    case 'part.bom_component_not_found':
      return { appCode: error.code, code: 'NOT_FOUND', message: error.message };
    case 'part.bom_cycle':
    case 'part.bom_quantity':
    case 'part.not_built':
      return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
    default:
      return assertNever(error);
  }
}

/** Only the Part failures a build can reach; the rest belong to the Part router's own surface. */
function mapPartCoreError(error: PartCoreError): CoreErrorMapping<PartCoreError['code']> {
  return error.code === 'part.not_found'
    ? { appCode: error.code, code: 'NOT_FOUND', message: 'Part not found.' }
    : { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
}

function mapBuildError(error: BuildError): CoreErrorMapping<BuildError['code']> {
  switch (error.code) {
    case 'inventory.build_component_not_found':
      return { appCode: error.code, code: 'NOT_FOUND', message: error.message };
    case 'inventory.build_linear_part':
    case 'inventory.build_periodic_part':
    case 'inventory.build_self_component':
      return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
    default:
      return assertNever(error);
  }
}

function mapJobCloseOutError(error: JobCloseOutError): CoreErrorMapping<JobCloseOutError['code']> {
  switch (error.code) {
    case 'inventory.job_already_closed_out':
    case 'inventory.job_closed_out':
    case 'inventory.job_not_completed':
      return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
    default:
      return assertNever(error);
  }
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
