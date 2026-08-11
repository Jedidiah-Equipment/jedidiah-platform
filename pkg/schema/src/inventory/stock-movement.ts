import { z } from 'zod';
import { AuthId } from '../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../common/date.js';
import { CursorQueryInput, createCursorQueryResult } from '../common/pagination.js';
import { Price } from '../common/price.js';
import { JobCode, PurchaseOrderCode } from '../common/public-code.js';
import { nullableTrimmedText, nullableTrimmedTextInput, SearchText } from '../common/text.js';
import { NullableThumbnailDataUrl } from '../common/thumbnail.js';
import { UUID } from '../common/uuid.js';
import { PartCode, PartStandardPurchaseLengthMm, PartStockTrackingMode, PartUnitOfMeasure } from '../parts/part.js';
import { SupplierCompanyName } from '../suppliers/supplier.js';
import { declareInventoryCostFields, InventoryCost, InventoryUnitCost, InventoryValue } from './inventory-cost.js';
import { StocktakeScope } from './stocktake-scope.js';

export type StockMovementType = z.infer<typeof StockMovementType>;
export const StockMovementType = z.enum([
  'adjustment',
  'revaluation',
  'checkout',
  'return-to-store',
  'receipt',
  'return-to-supplier',
  'build-consume',
  'build-produce',
]);

/** The movement types a Job draws and returns through; the ledger's other types are stock-only. */
export type JobStockMovementType = z.infer<typeof JobStockMovementType>;
export const JobStockMovementType = StockMovementType.extract(['checkout', 'return-to-store']);

/** The one compile-checked list of Job-attributed movement types; every net-drawn sum reads it all. */
export const JOB_STOCK_MOVEMENT_TYPES = JobStockMovementType.options;

export type StockAdjustmentReason = z.infer<typeof StockAdjustmentReason>;
export const StockAdjustmentReason = z.enum(['opening-balance', 'stock-count', 'damage', 'scrap', 'correction']);

/** Why stock went back to the Supplier (spec §4) — its own closed set, never an adjustment reason. */
export type StockReturnToSupplierReason = z.infer<typeof StockReturnToSupplierReason>;
export const StockReturnToSupplierReason = z.enum(['wrong-item', 'defective', 'order-error']);

export const STOCK_RETURN_TO_SUPPLIER_REASON_LABELS = {
  defective: 'Defective',
  'order-error': 'Order error',
  'wrong-item': 'Wrong item',
} as const satisfies Record<StockReturnToSupplierReason, string>;

/**
 * Every reason the ledger's `reason` column may hold. The column is one widened set while each
 * movement type's own shape pins the subset it accepts, so an adjustment can never claim a return
 * reason and a return can never claim `scrap`.
 */
export type StockMovementReason = z.infer<typeof StockMovementReason>;
export const StockMovementReason = z.enum([...StockAdjustmentReason.options, ...StockReturnToSupplierReason.options]);

export const STOCK_ADJUSTMENT_REASON_LABELS = {
  correction: 'Correction',
  damage: 'Damage',
  'opening-balance': 'Opening balance',
  scrap: 'Scrap',
  'stock-count': 'Stock count',
} as const satisfies Record<StockAdjustmentReason, string>;

/** The adjustment reasons a periodic Part accepts: its go-live seed and the count that corrects it. */
export const PERIODIC_STOCK_ADJUSTMENT_REASONS = ['opening-balance', 'stock-count'] as const;

export function isPeriodicStockAdjustmentReason(reason: StockAdjustmentReason): boolean {
  return (PERIODIC_STOCK_ADJUSTMENT_REASONS as readonly StockAdjustmentReason[]).includes(reason);
}

export type StockMovementDelta = z.infer<typeof StockMovementDelta>;
export const StockMovementDelta = z.number().finite().multipleOf(0.001, 'Delta supports at most three decimal places');

export type StockMovementQuantity = z.infer<typeof StockMovementQuantity>;
export const StockMovementQuantity = StockMovementDelta.positive();

export type StockMovementLengthMm = z.infer<typeof StockMovementLengthMm>;
export const StockMovementLengthMm = z.int().positive();

const MovementTargetInput = z.object({
  lengthMm: StockMovementLengthMm.nullable().default(null),
  partId: UUID,
});

/**
 * Who the shared stores tablet attributes this movement to (spec §11): the device authorizes, the
 * person attributes. The tablet holds one session as the "Stores Tablet" user and names the person
 * at the scan field through its quick-switch, so the ledger records the hand that moved the stock
 * rather than the device it was keyed on.
 *
 * Omitted — every web surface, and the tablet before anyone has identified themselves — attributes
 * the signed-in user. Asserting an actor never widens what the caller may do: the asserted person's
 * own permissions are never consulted, and an unknown or disabled one is refused rather than ignored.
 *
 * Optional rather than defaulted-to-null, because absence *is* the meaning: a caller with nobody to
 * name leaves the field off entirely, and every surface that predates the tablet keeps compiling
 * without being made to spell out that it has no quick-switch.
 */
export type AssertedActorUserId = z.infer<typeof AssertedActorUserId>;
export const AssertedActorUserId = AuthId.nullish();

/** Checkout and return-to-store take the same target; the movement type decides the sign. */
export type PostJobMovementInput = z.infer<typeof PostJobMovementInput>;
export const PostJobMovementInput = MovementTargetInput.extend({
  actorUserId: AssertedActorUserId,
  jobId: UUID,
  quantity: StockMovementQuantity,
}).strict();

export type PostAdjustmentInput = z.infer<typeof PostAdjustmentInput>;
export const PostAdjustmentInput = MovementTargetInput.extend({
  actorUserId: AssertedActorUserId,
  delta: StockMovementDelta,
  note: nullableTrimmedTextInput(),
  reason: StockAdjustmentReason,
  unitCost: Price.nullable().default(null),
})
  .strict()
  .superRefine((input, context) => {
    if (input.reason !== 'opening-balance' && input.note === null) {
      context.addIssue({
        code: 'custom',
        message: 'A note is required for this adjustment reason',
        path: ['note'],
      });
    }

    if (input.reason !== 'opening-balance' && input.unitCost !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Unit cost is only valid for an opening balance',
        path: ['unitCost'],
      });
    }
  });

/**
 * What the dock confirms: how much arrived, and for linear stock which length it came in. `unitCost`
 * is an optional correction only a cost reader may send — a price-blind receiver posts the PO line's
 * own price by leaving it null, and `lengthMm` defaults to the Part's standard purchase length.
 */
export type PostReceiptInput = z.infer<typeof PostReceiptInput>;
export const PostReceiptInput = z
  .object({
    actorUserId: AssertedActorUserId,
    lengthMm: StockMovementLengthMm.nullable().default(null),
    partId: UUID,
    purchaseOrderId: UUID,
    quantity: StockMovementQuantity,
    unitCost: InventoryUnitCost.nullable().default(null),
  })
  .strict();

/**
 * What goes back to the Supplier off one received Purchase Order line. The value is never keyed —
 * it comes off the stamped receipts the line already holds (spec §4) — so this input carries only
 * the physical fact and why it is going back.
 */
export type PostReturnToSupplierInput = z.infer<typeof PostReturnToSupplierInput>;
export const PostReturnToSupplierInput = z
  .object({
    actorUserId: AssertedActorUserId,
    lengthMm: StockMovementLengthMm.nullable().default(null),
    note: nullableTrimmedTextInput(),
    partId: UUID,
    purchaseOrderId: UUID,
    quantity: StockMovementQuantity,
    reason: StockReturnToSupplierReason,
  })
  .strict();

export type PostRevaluationInput = z.infer<typeof PostRevaluationInput>;
export const PostRevaluationInput = z
  .object({
    note: nullableTrimmedTextInput(),
    partId: UUID,
    unitCost: InventoryUnitCost,
  })
  .strict();

export type StockMovement = z.infer<typeof StockMovement>;
export const StockMovement = z.object({
  actorUserId: AuthId,
  buildId: UUID.nullable(),
  createdAt: DateIso,
  delta: StockMovementDelta,
  id: UUID,
  jobId: UUID.nullable(),
  lengthMm: StockMovementLengthMm.nullable(),
  movementType: StockMovementType,
  note: nullableTrimmedText(),
  partId: UUID,
  purchaseOrderId: UUID.nullable(),
  reason: StockMovementReason.nullable(),
  unitCost: InventoryCost,
});

export const StockMovementCostFields = declareInventoryCostFields(StockMovement, 'unitCost');

export type StockMovementWarningCode = z.infer<typeof StockMovementWarningCode>;
export const StockMovementWarningCode = z.enum([
  'bom-deviation',
  'exceeds-cfo',
  'exceeds-drawn',
  'exceeds-ordered',
  'exceeds-received',
  'negative-stock-on-hand',
]);

export type StockMovementPostResult = z.infer<typeof StockMovementPostResult>;
export const StockMovementPostResult = z.object({
  movement: StockMovement,
  warnings: z.array(StockMovementWarningCode),
});

/** One length bucket of a Part's stock; discrete and measured Parts hold exactly one `null` bucket. */
export type StockOnHandBucket = z.infer<typeof StockOnHandBucket>;
export const StockOnHandBucket = z.object({
  lengthMm: StockMovementLengthMm.nullable(),
  quantity: z.number().finite(),
  totalValue: InventoryValue,
});

export const StockOnHandBucketCostFields = declareInventoryCostFields(StockOnHandBucket, 'totalValue');

export type StockOnHandRow = z.infer<typeof StockOnHandRow>;
export const StockOnHandRow = z.object({
  asOfLastCount: DateIso.nullable(),
  averageUnitCost: InventoryCost,
  buckets: z.array(StockOnHandBucket).min(1),
  committed: z.number().finite(),
  free: z.number().finite(),
  isInternallyFabricated: z.boolean(),
  partCode: z.string(),
  partId: UUID,
  partName: z.string(),
  quantity: z.number().finite(),
  standardPurchaseLengthMm: PartStandardPurchaseLengthMm.nullable(),
  stockTrackingMode: PartStockTrackingMode,
  totalValue: InventoryValue,
  unitOfMeasure: PartUnitOfMeasure,
});

export const StockOnHandRowCostFields = declareInventoryCostFields(StockOnHandRow, 'averageUnitCost', 'totalValue');

export type StockOnHandResult = z.infer<typeof StockOnHandResult>;
export const StockOnHandResult = z.object({ items: z.array(StockOnHandRow) });

export type JobStockInput = z.infer<typeof JobStockInput>;
export const JobStockInput = z.object({ jobId: UUID }).strict();

export type JobStockLengthBucket = z.infer<typeof JobStockLengthBucket>;
export const JobStockLengthBucket = z.object({
  drawnQuantity: z.number().finite(),
  lengthMm: StockMovementLengthMm,
});

export type JobStockRow = z.infer<typeof JobStockRow>;
export const JobStockRow = z.object({
  cfoQuantity: z.number().finite(),
  committedQuantity: z.number().finite(),
  drawnQuantity: z.number().finite(),
  /** Plant-wide free stock for the Part, so the tab that decides buying shows what is already here. */
  freeQuantity: z.number().finite(),
  /** A Built Part is made in-house, so it can hold commitment but never reach a Purchase Order. */
  isInternallyFabricated: z.boolean(),
  lengthBuckets: z.array(JobStockLengthBucket),
  /** Σ(ordered − received) over open sent lines — shown beside free, never folded into it (§3). */
  onOrder: z.number().finite(),
  partCode: z.string(),
  partId: UUID,
  partName: z.string(),
  standardPurchaseLengthMm: PartStandardPurchaseLengthMm.nullable(),
  stockTrackingMode: PartStockTrackingMode,
  supplierName: SupplierCompanyName.nullable(),
  unitOfMeasure: PartUnitOfMeasure,
});

/**
 * The Job facts the stock surfaces need. They ride the stock read rather than a Job read because
 * `stores` closes Jobs out without holding `job:read`.
 */
export type JobStockJob = z.infer<typeof JobStockJob>;
export const JobStockJob = z.object({
  cancelledAt: DateIso.nullable(),
  closedOutAt: DateIso.nullable(),
  code: JobCode,
  completedOn: DateOnlyIso.nullable(),
  displayName: z.string(),
  id: UUID,
});

export type JobStockResult = z.infer<typeof JobStockResult>;
export const JobStockResult = z.object({ items: z.array(JobStockRow), job: JobStockJob });

/**
 * One Part's material variance on a Job (spec §3): what the CFO planned, what the Job actually drew
 * net of its returns, and what those draws cost at the price they were stamped with.
 *
 * Length buckets are summed away deliberately — a Job that drew two lengths of the same channel is
 * over or under on the channel, not on a bucket, and the drawn figure the variance is measured
 * against is the Part's. Planned *cost* is deliberately absent: the CFO froze quantities only, so
 * the money column here is actuals. Estimated-versus-actual is the Job's own estimate snapshot.
 */
export type JobMaterialVarianceRow = z.infer<typeof JobMaterialVarianceRow>;
export const JobMaterialVarianceRow = z.object({
  /** Σ(quantity × stamped unit cost) over the Job's draws, net of returns; never re-priced today. */
  actualCost: InventoryValue,
  drawnQuantity: z.number().finite(),
  partCode: z.string(),
  partId: UUID,
  partName: z.string(),
  /** The CFO's demand, summed across its assemblies. Zero on a Part the Job drew off-CFO. */
  plannedQuantity: z.number().finite(),
  unitOfMeasure: PartUnitOfMeasure,
  /** Drawn minus planned: positive is an over-draw, negative is demand the Job never took. */
  varianceQuantity: z.number().finite(),
});

export const JobMaterialVarianceRowCostFields = declareInventoryCostFields(JobMaterialVarianceRow, 'actualCost');

/**
 * A Part the Job drew but never planned for — every draw on a Custom Job reads this way. Defined
 * once because the server totals it, the report counts it, and the table badges it, and the three
 * must agree about what "unplanned" means.
 */
export function isOffCfo(row: Pick<JobMaterialVarianceRow, 'plannedQuantity'>): boolean {
  return row.plannedQuantity === 0;
}

/**
 * The Job's material variance report. Off-CFO cost is called out beside the total that contains it:
 * parts drawn against a Job its CFO never planned — every draw on a Custom Job — are the unplanned
 * cost eating the margin, and a lone total would bury exactly that.
 */
export type JobMaterialVarianceResult = z.infer<typeof JobMaterialVarianceResult>;
export const JobMaterialVarianceResult = z.object({
  items: z.array(JobMaterialVarianceRow),
  job: JobStockJob,
  /** The share of the total drawn against no CFO line at all. */
  offCfoActualCost: InventoryValue,
  /** Σ of every row's actual cost; null as soon as one drawn Part has no cost yet. */
  totalActualCost: InventoryValue,
});

export const JobMaterialVarianceResultCostFields = declareInventoryCostFields(
  JobMaterialVarianceResult,
  'offCfoActualCost',
  'totalActualCost',
);

export type InventoryJobOptionListInput = z.infer<typeof InventoryJobOptionListInput>;
export const InventoryJobOptionListInput = CursorQueryInput.extend({
  movementType: JobStockMovementType,
  search: SearchText,
});

export type InventoryJobOption = z.infer<typeof InventoryJobOption>;
export const InventoryJobOption = z.object({
  code: z.string(),
  completedOn: DateOnlyIso.nullable(),
  displayName: z.string(),
  id: UUID,
});

export type InventoryJobOptionListResult = z.infer<typeof InventoryJobOptionListResult>;
export const InventoryJobOptionListResult = createCursorQueryResult(InventoryJobOption);

/**
 * What a scanned Part label resolves to. The code is matched exactly — a Code 128 read is all-or-
 * nothing, so a partial match would mean a damaged label silently resolved to a neighbouring Part.
 * Type-ahead search is the fallback for that (spec §10), and it goes through the ordinary Part list.
 */
export type PartStockByCodeInput = z.infer<typeof PartStockByCodeInput>;
export const PartStockByCodeInput = z.object({ code: PartCode }).strict();

/**
 * A Part as the stores tablet's type-ahead needs it: enough to recognise on a shelf, and nothing
 * more. Deliberately not a `StockOnHandRow` — that row carries valuation, and deriving it means
 * replaying the whole ledger for a moving average, which is far too much work to do per keystroke
 * for a role that may not see a price anyway. Quantity here is a plain sum of the Part's deltas.
 */
export type PartSearchRow = z.infer<typeof PartSearchRow>;
export const PartSearchRow = z.object({
  partCode: z.string(),
  partId: UUID,
  partName: z.string(),
  quantity: z.number().finite(),
  unitOfMeasure: PartUnitOfMeasure,
});

/**
 * Not `.strict()`, like every other cursor input here: tRPC's infinite query appends its own
 * `direction` key to the page params, and a strict schema rejects the whole request over it.
 */
export type PartSearchInput = z.infer<typeof PartSearchInput>;
export const PartSearchInput = CursorQueryInput.extend({ search: SearchText });

export type PartSearchResult = z.infer<typeof PartSearchResult>;
export const PartSearchResult = createCursorQueryResult(PartSearchRow);

/**
 * A person the stores tablet's quick-switch may attribute a movement to (spec §11): the `stores`
 * role, minus anyone disabled. Deliberately not a `UserSummary` — the grid needs a face and a name
 * to tap, and the tablet is a shared device that should hold no more about anyone than that.
 */
export type QuickSwitchActor = z.infer<typeof QuickSwitchActor>;
export const QuickSwitchActor = z.object({
  id: AuthId,
  name: z.string().trim().min(1),
  thumbnailDataUrl: NullableThumbnailDataUrl,
});

export type QuickSwitchActorListResult = z.infer<typeof QuickSwitchActorListResult>;
export const QuickSwitchActorListResult = z.object({ items: z.array(QuickSwitchActor) });

export type StockMovementHistoryInput = z.infer<typeof StockMovementHistoryInput>;
export const StockMovementHistoryInput = z.object({ partId: UUID });

/**
 * One ledger row as the Part's history shows it, carrying the reference that explains *why* it was
 * posted: the order it arrived on, the Job it was drawn to, or the stocktake walk that counted it.
 * Each is the movement's own foreign key resolved to something a reader can follow.
 */
export type StockMovementHistoryRow = z.infer<typeof StockMovementHistoryRow>;
export const StockMovementHistoryRow = StockMovement.extend({
  actorName: z.string(),
  jobCode: JobCode.nullable(),
  movementValue: InventoryValue,
  purchaseOrderCode: PurchaseOrderCode.nullable(),
  runningBalance: z.number().finite(),
  stocktakeSessionId: UUID.nullable(),
  stocktakeSessionScope: StocktakeScope.nullable(),
});

export const StockMovementHistoryRowCostFields = declareInventoryCostFields(
  StockMovementHistoryRow,
  'movementValue',
  'unitCost',
);

export type StockMovementHistoryResult = z.infer<typeof StockMovementHistoryResult>;
export const StockMovementHistoryResult = z.object({
  items: z.array(StockMovementHistoryRow),
  part: z.object({
    code: z.string(),
    id: UUID,
    name: z.string(),
    unitOfMeasure: PartUnitOfMeasure,
  }),
});
