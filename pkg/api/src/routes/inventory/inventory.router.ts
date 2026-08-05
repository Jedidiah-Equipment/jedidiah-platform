import {
  closeOutJob,
  getPartStockByCode,
  getStockMovementHistory,
  listBuyList,
  listCloseOutQueue,
  listJobStock,
  listJobs,
  listQuickSwitchActors,
  listStockOnHand,
  postAdjustment,
  postBuild,
  postJobMovement,
  postRevaluation,
} from '@pkg/core';
import { getJobDisplayName } from '@pkg/domain';
import {
  BuildPostResult,
  BuyListResult,
  CloseOutJobInput,
  CloseOutQueueResult,
  InventoryJobOptionListInput,
  InventoryJobOptionListResult,
  JobCloseOut,
  JobStockInput,
  JobStockResult,
  PartStockByCodeInput,
  PostAdjustmentInput,
  PostBuildInput,
  PostJobMovementInput,
  PostRevaluationInput,
  QuickSwitchActorListResult,
  StockMovement,
  StockMovementHistoryInput,
  StockMovementHistoryResult,
  StockMovementHistoryRowCostFields,
  StockMovementPostResult,
  StockOnHandBucketCostFields,
  StockOnHandResult,
  StockOnHandRow,
  StockOnHandRowCostFields,
} from '@pkg/schema';

import { mapCoreErrors } from '../../trpc/errors.js';
import { authorizedProcedure, type InventoryCostAccess, projectInventoryCostFields, router } from '../../trpc/init.js';
import { partBomErrorFamily, partCoreErrorFamily } from '../parts/part-error-families.js';
import {
  assertedActorErrorFamily,
  buildErrorFamily,
  jobCloseOutErrorFamily,
  stockMovementErrorFamily,
  stockMovementJobErrorFamily,
} from './inventory-error-families.js';
import { assertCanWriteInventoryCost, projectMovement } from './stock-movement-transport.js';

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

  /**
   * Quantity-only by design: the row carries what is short and what is coming, never a price. That
   * keeps it readable by the stores role the cost gate holds prices back from (spec §11).
   */
  buyList: authorizedProcedure('inventory:read')
    .output(BuyListResult)
    .query(({ ctx }) => listBuyList({ db: ctx.db })),

  stockOnHand: authorizedProcedure('inventory:read')
    .output(StockOnHandResult)
    .query(async ({ ctx }) => {
      const result = await listStockOnHand({ db: ctx.db });

      return { items: result.items.map((row) => projectStockOnHandRow(row, ctx.access)) };
    }),

  /**
   * What a scanned Part label resolves to on the stores tablet. Read under `inventory:read` and
   * cost-projected exactly as the stock report is, so the price-blind scanner sees a Part's
   * quantities and its length buckets and nothing about what it is worth.
   */
  partByCode: authorizedProcedure('inventory:read')
    .input(PartStockByCodeInput)
    .output(StockOnHandRow)
    .query(async ({ ctx, input }) => {
      const row = await mapStockLedgerErrors(() => getPartStockByCode({ code: input.code, db: ctx.db }));

      return projectStockOnHandRow(row, ctx.access);
    }),

  /**
   * The names the tablet's quick-switch offers. Gated on `inventory:move` rather than `user:list`:
   * the device holding this session posts movements and needs to know whose name to put on them,
   * which is not the same right as reading the platform's user administration.
   */
  quickSwitchActors: authorizedProcedure('inventory:move')
    .output(QuickSwitchActorListResult)
    .query(({ ctx }) => listQuickSwitchActors({ db: ctx.db })),

  history: authorizedProcedure('inventory:read')
    .input(StockMovementHistoryInput)
    .output(StockMovementHistoryResult)
    .query(async ({ ctx, input }) => {
      const result = await mapStockLedgerErrors(() => getStockMovementHistory({ db: ctx.db, partId: input.partId }));

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
    .query(({ ctx, input }) => mapJobStockErrors(() => listJobStock({ db: ctx.db, jobId: input.jobId }))),

  closeOutQueue: authorizedProcedure('inventory:close-out')
    .output(CloseOutQueueResult)
    .query(({ ctx }) => listCloseOutQueue({ db: ctx.db })),

  closeOutJob: authorizedProcedure('inventory:close-out')
    .input(CloseOutJobInput)
    .output(JobCloseOut)
    .mutation(({ ctx, input }) =>
      mapJobStockErrors(() => closeOutJob({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
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

      const movement = await mapStockLedgerErrors(() =>
        postAdjustment({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      );

      return projectMovement(movement, ctx.access);
    }),

  postCheckout: authorizedProcedure('inventory:move')
    .input(PostJobMovementInput)
    .output(StockMovementPostResult)
    .mutation(async ({ ctx, input }) => {
      const result = await mapJobStockErrors(() =>
        postJobMovement({ actorUserId: ctx.session.user.id, db: ctx.db, input, movementType: 'checkout' }),
      );

      return { ...result, movement: projectMovement(result.movement, ctx.access) };
    }),

  postReturnToStore: authorizedProcedure('inventory:move')
    .input(PostJobMovementInput)
    .output(StockMovementPostResult)
    .mutation(async ({ ctx, input }) => {
      const result = await mapJobStockErrors(() =>
        postJobMovement({ actorUserId: ctx.session.user.id, db: ctx.db, input, movementType: 'return-to-store' }),
      );

      return { ...result, movement: projectMovement(result.movement, ctx.access) };
    }),

  postRevaluation: authorizedProcedure('inventory_cost:revalue')
    .input(PostRevaluationInput)
    .output(StockMovement)
    .mutation(async ({ ctx, input }) => {
      const movement = await mapStockLedgerErrors(() =>
        postRevaluation({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      );

      return projectMovement(movement, ctx.access);
    }),
});

/**
 * The one path from a stock row to what the API serves, so a value cannot escape the gate on one
 * surface while being stripped on another. A row and its length buckets each carry their own cost
 * fields, so both have to be projected — missing the inner pass is the mistake this exists to stop.
 */
function projectStockOnHandRow(row: StockOnHandRow, access: InventoryCostAccess): StockOnHandRow {
  return projectInventoryCostFields({
    access,
    costFields: StockOnHandRowCostFields,
    output: {
      ...row,
      buckets: row.buckets.map((bucket) =>
        projectInventoryCostFields({ access, costFields: StockOnHandBucketCostFields, output: bucket }),
      ),
    },
  });
}

/** Stock the plant owns outright: no Job to be cancelled or closed out, only the ledger's own rules. */
async function mapStockLedgerErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapCoreErrors(action, stockMovementErrorFamily);
}

/**
 * Anything attributed to a Job carries all three vocabularies: the ledger's rules, the Job's own
 * state, and close-out — a draw against a closed-out Job is refused exactly as a second close is.
 * The tablet's quick-switch adds a fourth, since any of these may name the person who did it.
 */
async function mapJobStockErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapCoreErrors(
    action,
    stockMovementErrorFamily,
    stockMovementJobErrorFamily,
    jobCloseOutErrorFamily,
    assertedActorErrorFamily,
  );
}

/** A build shares the ledger rules and the Part failures it reaches for, but no Job vocabulary. */
async function mapBuildErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapCoreErrors(action, stockMovementErrorFamily, buildErrorFamily, partBomErrorFamily, partCoreErrorFamily);
}
