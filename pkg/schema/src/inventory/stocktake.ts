import { z } from 'zod';
import { AuthId } from '../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../common/date.js';
import { CursorQueryInput, createCursorQueryResult } from '../common/pagination.js';
import { UUID } from '../common/uuid.js';
import { PartUnitOfMeasure } from '../parts/part.js';
import { declareInventoryCostFields, InventoryValue } from './inventory-cost.js';
import { AssertedActorUserId, StockMovement, StockMovementDelta, StockMovementLengthMm } from './stock-movement.js';
import { StocktakeScope } from './stocktake-scope.js';

export * from './stocktake-scope.js';

/**
 * Where a walk sits in its life. Derived from `closedAt` rather than stored — a session has no
 * status column, because closing is the only transition it has and the timestamp already records it.
 */
export type StocktakeSessionStatus = z.infer<typeof StocktakeSessionStatus>;
export const StocktakeSessionStatus = z.enum(['open', 'closed']);

export type OpenStocktakeSessionInput = z.infer<typeof OpenStocktakeSessionInput>;
export const OpenStocktakeSessionInput = z.object({ actorUserId: AssertedActorUserId, scope: StocktakeScope }).strict();

export type CloseStocktakeSessionInput = z.infer<typeof CloseStocktakeSessionInput>;
export const CloseStocktakeSessionInput = z.object({ actorUserId: AssertedActorUserId, sessionId: UUID }).strict();

export type StocktakeSessionInput = z.infer<typeof StocktakeSessionInput>;
export const StocktakeSessionInput = z.object({ sessionId: UUID }).strict();

/**
 * One bucket of a count: what the person standing at the rack saw. Linear Parts name a length and
 * discrete and measured Parts carry the single `null` bucket, exactly as the ledger does.
 *
 * `observed` is what is *there*, never a delta — zero is a legitimate observation and is what empties
 * a bucket.
 */
export type StockCountBucketInput = z.infer<typeof StockCountBucketInput>;
export const StockCountBucketInput = z
  .object({
    lengthMm: StockMovementLengthMm.nullable().default(null),
    observed: StockMovementDelta.nonnegative(),
  })
  .strict();

/**
 * One Part counted in one session. The count covers the whole Part, so a bucket the ledger holds
 * stock in and this list does not name is counted as empty — that is what makes a count a
 * correction of the shelf rather than a partial patch of it.
 */
export type PostStockCountInput = z.infer<typeof PostStockCountInput>;
export const PostStockCountInput = z
  .object({
    actorUserId: AssertedActorUserId,
    buckets: z.array(StockCountBucketInput).min(1),
    partId: UUID,
    sessionId: UUID,
  })
  .strict()
  .superRefine((input, context) => {
    const seen = new Set<number | null>();

    for (const [index, bucket] of input.buckets.entries()) {
      if (seen.has(bucket.lengthMm)) {
        context.addIssue({
          code: 'custom',
          message: 'Each length may only be counted once',
          path: ['buckets', index, 'lengthMm'],
        });
      }

      seen.add(bucket.lengthMm);
    }
  });

/** What one counted bucket did to the ledger: the blind figure, the figure it corrected, the gap. */
export type StockCountBucketVariance = z.infer<typeof StockCountBucketVariance>;
export const StockCountBucketVariance = z.object({
  delta: z.number().finite(),
  expected: z.number().finite(),
  lengthMm: StockMovementLengthMm.nullable(),
  observed: z.number().finite(),
});

/**
 * The informed-review step's evidence, produced by the post rather than read beforehand: expected
 * is the stock on hand the ledger held at count time, under the same lock the movements were
 * appended through, so it can never be a figure that moved between the read and the write.
 */
export type StockCountResult = z.infer<typeof StockCountResult>;
export const StockCountResult = z.object({
  buckets: z.array(StockCountBucketVariance),
  movements: z.array(StockMovement),
  partId: UUID,
  sessionId: UUID,
});

export type StocktakeSession = z.infer<typeof StocktakeSession>;
export const StocktakeSession = z.object({
  closedAt: DateIso.nullable(),
  closedByName: z.string().nullable(),
  closedByUserId: AuthId.nullable(),
  countedPartCount: z.number().int().nonnegative(),
  id: UUID,
  openedAt: DateIso,
  openedByName: z.string(),
  openedByUserId: AuthId,
  scope: StocktakeScope,
});

export type StocktakeSessionListResult = z.infer<typeof StocktakeSessionListResult>;
export const StocktakeSessionListResult = z.object({ items: z.array(StocktakeSession) });

/** One Part's count within a session, rolled up from its buckets — the variance report's row. */
export type StocktakeSessionCount = z.infer<typeof StocktakeSessionCount>;
export const StocktakeSessionCount = z.object({
  buckets: z.array(StockCountBucketVariance).min(1),
  countedAt: DateIso,
  countedByName: z.string(),
  delta: z.number().finite(),
  partCode: z.string(),
  partId: UUID,
  partName: z.string(),
  unitOfMeasure: PartUnitOfMeasure,
  /** The priced worth of the correction, positive or negative; null when the Part has no cost yet. */
  varianceValue: InventoryValue,
});

export const StocktakeSessionCountCostFields = declareInventoryCostFields(StocktakeSessionCount, 'varianceValue');

/** A Part the session's scope covers that nobody has counted yet: the to-do, and later the skip list. */
export type StocktakeUncountedPart = z.infer<typeof StocktakeUncountedPart>;
export const StocktakeUncountedPart = z.object({
  partCode: z.string(),
  partId: UUID,
  partName: z.string(),
  quantity: z.number().finite(),
  unitOfMeasure: PartUnitOfMeasure,
});

/**
 * Paged, because this list is the length of the scope: a stores walk covers every perpetual Part
 * the plant stocks, which is thousands, and the tablet re-reads it after every single count. Not
 * `.strict()`, like every other cursor input here — tRPC's infinite query appends its own
 * `direction` key to the page params, and a strict schema rejects the whole request over it.
 */
export type StocktakeUncountedInput = z.infer<typeof StocktakeUncountedInput>;
export const StocktakeUncountedInput = CursorQueryInput.extend({ sessionId: UUID });

export type StocktakeUncountedResult = z.infer<typeof StocktakeUncountedResult>;
export const StocktakeUncountedResult = createCursorQueryResult(StocktakeUncountedPart);

export type RawMaterialDriftRow = z.infer<typeof RawMaterialDriftRow>;
export const RawMaterialDriftRow = z.object({
  actualConsumption: z.number().finite().nullable(),
  driftFromExpectedFloor: z.number().finite().nullable(),
  expectedConsumptionFloor: z.number().finite().nonnegative(),
  partCode: z.string(),
  partId: UUID,
  partName: z.string(),
  unitOfMeasure: PartUnitOfMeasure,
});

export type RawMaterialDriftReport = z.infer<typeof RawMaterialDriftReport>;
export const RawMaterialDriftReport = z.object({
  fromCompletedOnExclusive: DateOnlyIso,
  fromSessionId: UUID,
  isFloor: z.literal(true),
  items: z.array(RawMaterialDriftRow),
  throughCompletedOn: DateOnlyIso,
  toSessionId: UUID,
});

/**
 * The session variance report. Deliberately does **not** carry the uncounted list: that list is
 * paged on its own, and the tablet reads it far more often than it reads this.
 */
export type StocktakeSessionReport = z.infer<typeof StocktakeSessionReport>;
export const StocktakeSessionReport = z.object({
  counts: z.array(StocktakeSessionCount),
  rawMaterialDrift: RawMaterialDriftReport.nullable(),
  session: StocktakeSession,
  /** Σ of every counted Part's variance value; null as soon as one counted Part has no cost. */
  totalVarianceValue: InventoryValue,
});

export const StocktakeSessionReportCostFields = declareInventoryCostFields(
  StocktakeSessionReport,
  'totalVarianceValue',
);

/**
 * Whether a standing rhythm has fallen behind (spec §12). Quantity-free and cost-free, so the
 * signal reads the same for the storeman it nags and the manager who tunes the cadence.
 */
export type StocktakeOverdueRow = z.infer<typeof StocktakeOverdueRow>;
export const StocktakeOverdueRow = z.object({
  /** The last working day a session may close on before the rhythm is late: due date plus grace. */
  dueBy: DateOnlyIso,
  isOverdue: z.boolean(),
  lastClosedOn: DateOnlyIso.nullable(),
  /** Whole days past `dueBy`, zero while the rhythm is on time. */
  overdueDays: z.number().int().nonnegative(),
  scope: StocktakeScope,
});

export type StocktakeOverdueResult = z.infer<typeof StocktakeOverdueResult>;
export const StocktakeOverdueResult = z.object({ items: z.array(StocktakeOverdueRow) });
