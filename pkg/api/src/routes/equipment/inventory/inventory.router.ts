import {
  closeOutJob,
  closeStocktakeSession,
  getInventoryKpis,
  getJobCostComparison,
  getJobMaterialVariance,
  getPartStockByCode,
  getStockMovementHistory,
  getStocktakeSession,
  getStocktakeSessionReport,
  listBuyList,
  listCloseOutQueue,
  listInventoryJobOptions,
  listJobStock,
  listQuickSwitchActors,
  listStockOnHand,
  listStocktakeOverdue,
  listStocktakeSessions,
  listStocktakeUncounted,
  openStocktakeSession,
  postAdjustment,
  postBuild,
  postJobMovement,
  postRevaluation,
  postStockCount,
  searchPartStock,
} from '@pkg/core/equipment';
import {
  BuildPostResult,
  BuildPostResultCostFields,
  BuyListResult,
  CloseOutJobInput,
  CloseOutQueueResult,
  CloseStocktakeSessionInput,
  InventoryJobOptionListInput,
  InventoryJobOptionListResult,
  InventoryKpis,
  JobCloseOut,
  JobCostComparison,
  JobMaterialVarianceResult,
  JobMaterialVarianceResultCostFields,
  JobMaterialVarianceRowCostFields,
  JobStockInput,
  JobStockResult,
  OpenStocktakeSessionInput,
  PartSearchInput,
  PartSearchResult,
  PartStockByCodeInput,
  PostAdjustmentInput,
  PostBuildInput,
  PostJobMovementInput,
  PostRevaluationInput,
  PostStockCountInput,
  QuickSwitchActorListResult,
  StockCountResult,
  StockMovement,
  StockMovementHistoryInput,
  StockMovementHistoryResult,
  StockMovementHistoryRowCostFields,
  StockMovementPostResult,
  StockOnHandBucketCostFields,
  StockOnHandResult,
  StockOnHandRow,
  StockOnHandRowCostFields,
  StocktakeOverdueResult,
  StocktakeSession,
  StocktakeSessionCountCostFields,
  StocktakeSessionInput,
  StocktakeSessionListResult,
  StocktakeSessionReport,
  StocktakeSessionReportCostFields,
  StocktakeUncountedInput,
  StocktakeUncountedResult,
} from '@pkg/schema/equipment';
import {
  canReadInventoryCosts,
  type InventoryCostAccess,
  projectInventoryCostFields,
  projectInventoryCostReport,
} from '../../../equipment/trpc/inventory-cost-projection.js';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { partBomErrorFamily, partCoreErrorFamily } from '../parts/part-error-families.js';
import {
  assertedActorErrorFamily,
  buildErrorFamily,
  jobCloseOutErrorFamily,
  stockMovementErrorFamily,
  stockMovementJobErrorFamily,
  stocktakeErrorFamily,
} from './inventory-error-families.js';
import { assertCanWriteInventoryCost, projectMovement } from './stock-movement-transport.js';

export const inventoryRouter = router({
  jobOptions: authorizedProcedure('equipment_inventory:move')
    .input(InventoryJobOptionListInput)
    .output(InventoryJobOptionListResult)
    .query(({ ctx, input }) => listInventoryJobOptions({ db: ctx.db, input })),

  /**
   * Quantity-only by design: the row carries what is short and what is coming, never a price. That
   * keeps it readable by the stores role the cost gate holds prices back from (spec §11).
   */
  buyList: authorizedProcedure('equipment_inventory:read')
    .output(BuyListResult)
    .query(({ ctx }) => listBuyList({ db: ctx.db })),

  inventoryKpis: authorizedProcedure('equipment_inventory_cost:read')
    .output(InventoryKpis)
    .query(({ ctx }) => getInventoryKpis({ db: ctx.db })),

  stockOnHand: authorizedProcedure('equipment_inventory:read')
    .output(StockOnHandResult)
    .query(async ({ ctx }) => {
      const result = await listStockOnHand({ db: ctx.db });

      return { items: result.items.map((row) => projectStockOnHandRow(row, ctx.access)) };
    }),

  /**
   * What a scanned Part label resolves to on the stores tablet. Read under `equipment_inventory:read` and
   * cost-projected exactly as the stock report is, so the price-blind scanner sees a Part's
   * quantities and its length buckets and nothing about what it is worth.
   */
  partByCode: authorizedProcedure('equipment_inventory:read')
    .input(PartStockByCodeInput)
    .output(StockOnHandRow)
    .query(async ({ ctx, input }) => {
      const row = await mapStockLedgerErrors(() => getPartStockByCode({ code: input.code, db: ctx.db }));

      return projectStockOnHandRow(row, ctx.access);
    }),

  /**
   * The tablet's type-ahead for a label that will not scan (spec §10). Quantity-only, so there is
   * no cost projection to apply — and deliberately not the stock report with a search term bolted
   * on, which would replay the whole ledger for a moving average nobody on this device may read.
   */
  partSearch: authorizedProcedure('equipment_inventory:read')
    .input(PartSearchInput)
    .output(PartSearchResult)
    .query(({ ctx, input }) => searchPartStock({ db: ctx.db, input })),

  /**
   * The names the tablet's quick-switch offers. Gated on `equipment_inventory:move` rather than `user:list`:
   * the device holding this session posts movements and needs to know whose name to put on them,
   * which is not the same right as reading the platform's user administration.
   */
  quickSwitchActors: authorizedProcedure('equipment_inventory:move')
    .output(QuickSwitchActorListResult)
    .query(({ ctx }) => listQuickSwitchActors({ db: ctx.db })),

  history: authorizedProcedure('equipment_inventory:read')
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

  jobStock: authorizedProcedure('equipment_inventory:read')
    .input(JobStockInput)
    .output(JobStockResult)
    .query(({ ctx, input }) => mapJobStockErrors(() => listJobStock({ db: ctx.db, jobId: input.jobId }))),

  /**
   * Planned against drawn for one Job, priced at what the draws were stamped with (spec §3). Read
   * under `equipment_inventory:read` like every other Job stock surface — a storeman may see how far a Job ran
   * past its plan — while the money it ran past it by stays behind the cost gate, row and total both.
   */
  jobVariance: authorizedProcedure('equipment_inventory:read')
    .input(JobStockInput)
    .output(JobMaterialVarianceResult)
    .query(async ({ ctx, input }) => {
      const report = await mapJobStockErrors(() => getJobMaterialVariance({ db: ctx.db, jobId: input.jobId }));

      return projectInventoryCostReport({
        access: ctx.access,
        costFields: JobMaterialVarianceResultCostFields,
        report,
        rowCostFields: JobMaterialVarianceRowCostFields,
        rowsField: 'items',
      });
    }),

  jobCostComparison: authorizedProcedure('equipment_inventory_cost:read')
    .input(JobStockInput)
    .output(JobCostComparison)
    .query(({ ctx, input }) => mapJobStockErrors(() => getJobCostComparison({ db: ctx.db, jobId: input.jobId }))),

  closeOutQueue: authorizedProcedure('equipment_inventory:close-out')
    .output(CloseOutQueueResult)
    .query(({ ctx }) => listCloseOutQueue({ db: ctx.db })),

  closeOutJob: authorizedProcedure('equipment_inventory:close-out')
    .input(CloseOutJobInput)
    .output(JobCloseOut)
    .mutation(({ ctx, input }) =>
      mapJobStockErrors(() => closeOutJob({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  /**
   * The counting rhythms and their walks. Reading a session is `equipment_inventory:read` because the variance
   * report is a *report* — procurement and management read it without ever walking a shelf — while
   * opening, counting, and closing are the physical act and stay on `equipment_inventory:count` (spec §11).
   */
  stocktakeSessions: authorizedProcedure('equipment_inventory:read')
    .output(StocktakeSessionListResult)
    .query(({ ctx }) => listStocktakeSessions({ db: ctx.db })),

  /** The session's own facts, cheap enough for the tablet to hold while it works through a walk. */
  stocktakeSession: authorizedProcedure('equipment_inventory:read')
    .input(StocktakeSessionInput)
    .output(StocktakeSession)
    .query(({ ctx, input }) =>
      mapStocktakeErrors(() => getStocktakeSession({ db: ctx.db, sessionId: input.sessionId })),
    ),

  /**
   * The variance report, which replays the ledger of every Part the walk touched. Desk-side and
   * read once — the tablet takes the session header and the paged uncounted list instead.
   */
  stocktakeSessionReport: authorizedProcedure('equipment_inventory:read')
    .input(StocktakeSessionInput)
    .output(StocktakeSessionReport)
    .query(async ({ ctx, input }) => {
      const report = await mapStocktakeErrors(() =>
        getStocktakeSessionReport({ db: ctx.db, sessionId: input.sessionId }),
      );

      return projectInventoryCostReport({
        access: ctx.access,
        costFields: StocktakeSessionReportCostFields,
        report: {
          ...report,
          rawMaterialDrift: canReadInventoryCosts(ctx.access) ? report.rawMaterialDrift : null,
        },
        rowCostFields: StocktakeSessionCountCostFields,
        rowsField: 'counts',
      });
    }),

  /**
   * What the walk still has to reach, and afterwards what it skipped. Paged and quantity-only, so
   * the tablet can re-read it after every count without shipping the catalogue each time.
   */
  stocktakeUncounted: authorizedProcedure('equipment_inventory:read')
    .input(StocktakeUncountedInput)
    .output(StocktakeUncountedResult)
    .query(({ ctx, input }) => mapStocktakeErrors(() => listStocktakeUncounted({ db: ctx.db, input }))),

  /**
   * Quantity-free and cost-free, so the storeman the signal nags reads exactly what the manager
   * tuning the cadence reads.
   */
  stocktakeOverdue: authorizedProcedure('equipment_inventory:read')
    .output(StocktakeOverdueResult)
    .query(({ ctx }) => listStocktakeOverdue({ db: ctx.db })),

  openStocktakeSession: authorizedProcedure('equipment_inventory:count')
    .input(OpenStocktakeSessionInput)
    .output(StocktakeSession)
    .mutation(({ ctx, input }) =>
      mapStocktakeErrors(() => openStocktakeSession({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  closeStocktakeSession: authorizedProcedure('equipment_inventory:count')
    .input(CloseStocktakeSessionInput)
    .output(StocktakeSession)
    .mutation(({ ctx, input }) =>
      mapStocktakeErrors(() => closeStocktakeSession({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  /**
   * A count carries no cost of its own — the correction is priced from the Part's average on the
   * report — so the movements it returns need only the ordinary ledger projection.
   */
  postStockCount: authorizedProcedure('equipment_inventory:count')
    .input(PostStockCountInput)
    .output(StockCountResult)
    .mutation(async ({ ctx, input }) => {
      const result = await mapStocktakeErrors(() =>
        postStockCount({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      );

      return { ...result, movements: result.movements.map((movement) => projectMovement(movement, ctx.access)) };
    }),

  /**
   * The produced cost is derived from what the build consumed rather than keyed, so it is gated on
   * the way out with no `assertCanWriteInventoryCost` counterpart on the way in.
   */
  postBuild: authorizedProcedure('equipment_inventory:build')
    .input(PostBuildInput)
    .output(BuildPostResult)
    .mutation(async ({ ctx, input }) => {
      const result = await mapBuildErrors(() => postBuild({ actorUserId: ctx.session.user.id, db: ctx.db, input }));

      return projectInventoryCostFields({
        access: ctx.access,
        costFields: BuildPostResultCostFields,
        output: result,
      });
    }),

  postAdjustment: authorizedProcedure('equipment_inventory:adjust')
    .input(PostAdjustmentInput)
    .output(StockMovement)
    .mutation(async ({ ctx, input }) => {
      assertCanWriteInventoryCost(ctx.access, input.unitCost);

      const movement = await mapStockLedgerErrors(() =>
        postAdjustment({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      );

      return projectMovement(movement, ctx.access);
    }),

  postCheckout: authorizedProcedure('equipment_inventory:move')
    .input(PostJobMovementInput)
    .output(StockMovementPostResult)
    .mutation(async ({ ctx, input }) => {
      const result = await mapJobStockErrors(() =>
        postJobMovement({ actorUserId: ctx.session.user.id, db: ctx.db, input, movementType: 'checkout' }),
      );

      return { ...result, movement: projectMovement(result.movement, ctx.access) };
    }),

  postReturnToStore: authorizedProcedure('equipment_inventory:move')
    .input(PostJobMovementInput)
    .output(StockMovementPostResult)
    .mutation(async ({ ctx, input }) => {
      const result = await mapJobStockErrors(() =>
        postJobMovement({ actorUserId: ctx.session.user.id, db: ctx.db, input, movementType: 'return-to-store' }),
      );

      return { ...result, movement: projectMovement(result.movement, ctx.access) };
    }),

  postRevaluation: authorizedProcedure('equipment_inventory_cost:revalue')
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

/**
 * Stock the plant owns outright: no Job to be cancelled or closed out, only the ledger's own rules —
 * plus who the row is attributed to, since a shared device may post an adjustment as readily as a
 * draw and must name a person for either.
 */
async function mapStockLedgerErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapCoreErrors(action, stockMovementErrorFamily, assertedActorErrorFamily);
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

/**
 * A count is a ledger write inside a walk, so it carries the ledger's rules, the walk's own, and
 * the tablet's quick-switch — but no Job vocabulary at all: a count is about the shelf, not a Job.
 */
async function mapStocktakeErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapCoreErrors(action, stocktakeErrorFamily, stockMovementErrorFamily, assertedActorErrorFamily);
}

/** A build shares the ledger rules and the Part failures it reaches for, but no Job vocabulary. */
async function mapBuildErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapCoreErrors(
    action,
    stockMovementErrorFamily,
    buildErrorFamily,
    partBomErrorFamily,
    partCoreErrorFamily,
    assertedActorErrorFamily,
  );
}
