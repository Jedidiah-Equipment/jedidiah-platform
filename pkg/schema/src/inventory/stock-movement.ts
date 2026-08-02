import { z } from 'zod';
import { AuthId } from '../auth/auth-id.js';
import { DateIso } from '../common/date.js';
import { createCursorQueryResult } from '../common/pagination.js';
import { Price } from '../common/price.js';
import { nullableTrimmedText, nullableTrimmedTextInput } from '../common/text.js';
import { UUID } from '../common/uuid.js';
import { JobListInput } from '../jobs/job.js';
import { PartStandardPurchaseLengthMm, PartStockTrackingMode, PartUnitOfMeasure } from '../parts/part.js';
import { InventoryCost, InventoryUnitCost, InventoryValue } from './inventory-cost.js';

export type StockMovementType = z.infer<typeof StockMovementType>;
export const StockMovementType = z.enum(['adjustment', 'revaluation', 'checkout', 'return-to-store']);

export type StockAdjustmentReason = z.infer<typeof StockAdjustmentReason>;
export const StockAdjustmentReason = z.enum(['opening-balance', 'stock-count', 'damage', 'scrap', 'correction']);

export const STOCK_ADJUSTMENT_REASON_LABELS = {
  correction: 'Correction',
  damage: 'Damage',
  'opening-balance': 'Opening balance',
  scrap: 'Scrap',
  'stock-count': 'Stock count',
} as const satisfies Record<StockAdjustmentReason, string>;

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

const JobMovementInput = MovementTargetInput.extend({
  jobId: UUID,
  quantity: StockMovementQuantity,
}).strict();

export type PostCheckoutInput = z.infer<typeof PostCheckoutInput>;
export const PostCheckoutInput = JobMovementInput;

export type PostReturnToStoreInput = z.infer<typeof PostReturnToStoreInput>;
export const PostReturnToStoreInput = JobMovementInput;

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
  reason: StockAdjustmentReason.nullable(),
  unitCost: InventoryUnitCost.nullable(),
});

export type StockMovementWarnings = z.infer<typeof StockMovementWarnings>;
export const StockMovementWarnings = z.object({
  exceedsCfo: z.boolean(),
  exceedsDrawn: z.boolean(),
  negativeStockOnHand: z.boolean(),
});

export type StockMovementPostResult = z.infer<typeof StockMovementPostResult>;
export const StockMovementPostResult = z.object({
  movement: StockMovement,
  warnings: StockMovementWarnings,
});

export type StockOnHandRow = z.infer<typeof StockOnHandRow>;
export const StockOnHandRow = z.object({
  averageUnitCost: InventoryCost,
  asOfLastCount: DateIso.nullable(),
  committed: z.number().finite(),
  free: z.number().finite(),
  isInternallyFabricated: z.boolean(),
  lengthMm: StockMovementLengthMm.nullable(),
  partCode: z.string(),
  partId: UUID,
  partName: z.string(),
  quantity: z.number().finite(),
  standardPurchaseLengthMm: PartStandardPurchaseLengthMm.nullable(),
  stockTrackingMode: PartStockTrackingMode,
  totalValue: InventoryValue,
  unitOfMeasure: PartUnitOfMeasure,
});

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

export type JobStockResult = z.infer<typeof JobStockResult>;
export const JobStockResult = z.object({ items: z.array(JobStockRow) });

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
