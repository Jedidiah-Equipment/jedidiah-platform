import { z } from 'zod';
import { AuthId } from '../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../common/date.js';
import { createCursorQueryResult } from '../common/pagination.js';
import { Price } from '../common/price.js';
import { JobCode } from '../common/public-code.js';
import { nullableTrimmedText, nullableTrimmedTextInput } from '../common/text.js';
import { UUID } from '../common/uuid.js';
import { JobListInput } from '../jobs/job.js';
import { PartStandardPurchaseLengthMm, PartStockTrackingMode, PartUnitOfMeasure } from '../parts/part.js';
import { declareInventoryCostFields, InventoryCost, InventoryUnitCost, InventoryValue } from './inventory-cost.js';

export type StockMovementType = z.infer<typeof StockMovementType>;
export const StockMovementType = z.enum(['adjustment', 'revaluation', 'checkout', 'return-to-store', 'receipt']);

/** The movement types a Job draws and returns through; the ledger's other types are stock-only. */
export type JobStockMovementType = z.infer<typeof JobStockMovementType>;
export const JobStockMovementType = StockMovementType.extract(['checkout', 'return-to-store']);

export type StockAdjustmentReason = z.infer<typeof StockAdjustmentReason>;
export const StockAdjustmentReason = z.enum(['opening-balance', 'stock-count', 'damage', 'scrap', 'correction']);

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

/** Checkout and return-to-store take the same target; the movement type decides the sign. */
export type PostJobMovementInput = z.infer<typeof PostJobMovementInput>;
export const PostJobMovementInput = MovementTargetInput.extend({
  jobId: UUID,
  quantity: StockMovementQuantity,
}).strict();

export type PostAdjustmentInput = z.infer<typeof PostAdjustmentInput>;
export const PostAdjustmentInput = MovementTargetInput.extend({
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
    lengthMm: StockMovementLengthMm.nullable().default(null),
    partId: UUID,
    purchaseOrderId: UUID,
    quantity: StockMovementQuantity,
    unitCost: InventoryUnitCost.nullable().default(null),
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
  createdAt: DateIso,
  delta: StockMovementDelta,
  id: UUID,
  jobId: UUID.nullable(),
  lengthMm: StockMovementLengthMm.nullable(),
  movementType: StockMovementType,
  note: nullableTrimmedText(),
  partId: UUID,
  purchaseOrderId: UUID.nullable(),
  reason: StockAdjustmentReason.nullable(),
  unitCost: InventoryCost,
});

export const StockMovementCostFields = declareInventoryCostFields(StockMovement, 'unitCost');

export type StockMovementWarningCode = z.infer<typeof StockMovementWarningCode>;
export const StockMovementWarningCode = z.enum([
  'exceeds-cfo',
  'exceeds-drawn',
  'exceeds-ordered',
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
  lengthBuckets: z.array(JobStockLengthBucket),
  partCode: z.string(),
  partId: UUID,
  partName: z.string(),
  standardPurchaseLengthMm: PartStandardPurchaseLengthMm.nullable(),
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

export type InventoryJobOptionListInput = z.infer<typeof InventoryJobOptionListInput>;
export const InventoryJobOptionListInput = JobListInput.pick({
  cursor: true,
  limit: true,
  search: true,
  sortBy: true,
  sortDirection: true,
});

export type InventoryJobOption = z.infer<typeof InventoryJobOption>;
export const InventoryJobOption = z.object({
  code: z.string(),
  displayName: z.string(),
  id: UUID,
});

export type InventoryJobOptionListResult = z.infer<typeof InventoryJobOptionListResult>;
export const InventoryJobOptionListResult = createCursorQueryResult(InventoryJobOption);

export type StockMovementHistoryInput = z.infer<typeof StockMovementHistoryInput>;
export const StockMovementHistoryInput = z.object({ partId: UUID });

export type StockMovementHistoryRow = z.infer<typeof StockMovementHistoryRow>;
export const StockMovementHistoryRow = StockMovement.extend({
  actorName: z.string(),
  movementValue: InventoryValue,
  runningBalance: z.number().finite(),
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
