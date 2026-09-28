import { z } from 'zod';

import { UUID } from '../../common/uuid.js';
import { declareInventoryCostFields, InventoryCost } from '../inventory/inventory-cost.js';
import { StocktakeScope } from '../inventory/stocktake-scope.js';
import { PartCode, PartName, PartUnitOfMeasure } from './part.js';

export type PartMergeInput = z.infer<typeof PartMergeInput>;
export const PartMergeInput = z.object({
  sourceId: UUID,
  targetId: UUID,
});

/**
 * Why a pair of Parts cannot become one yet. Each is something the user fixes before merging, never
 * something the merge guesses at: a quantity that means different things on each side, an order line
 * whose price would have to be picked, a BOM that would contain itself, or a count still being walked.
 */
export type PartMergeBlocker = z.infer<typeof PartMergeBlocker>;
export const PartMergeBlocker = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unit-of-measure') }),
  z.object({ kind: z.literal('standard-purchase-length') }),
  z.object({ kind: z.literal('stock-tracking-mode') }),
  z.object({ kind: z.literal('built-part') }),
  z.object({ kind: z.literal('open-order-supplier'), purchaseOrderCodes: z.array(z.string()) }),
  z.object({ kind: z.literal('same-purchase-order'), purchaseOrderCodes: z.array(z.string()) }),
  z.object({ kind: z.literal('bom-link') }),
  z.object({ kind: z.literal('open-stocktake'), scope: StocktakeScope }),
]);

export type PartMergeSide = z.infer<typeof PartMergeSide>;
export const PartMergeSide = z.object({
  /** The moving average, per standard-length piece for a linear Part. */
  averageUnitCost: InventoryCost,
  code: PartCode,
  id: UUID,
  name: PartName,
  /** A linear Part's stock is a count of pieces across its length buckets, never a length. */
  onHand: z.number(),
});

export const PartMergeSideCostFields = declareInventoryCostFields(PartMergeSide, 'averageUnitCost');

/** A record holding both Parts, whose two lines become one with their quantities added. */
export type PartMergeSummedLine = z.infer<typeof PartMergeSummedLine>;
export const PartMergeSummedLine = z.object({
  kind: z.enum(['assembly', 'bom', 'job', 'product']),
  label: z.string(),
});

export type PartMergeMovedCounts = z.infer<typeof PartMergeMovedCounts>;
export const PartMergeMovedCounts = z.object({
  bomLines: z.number().int().nonnegative(),
  jobs: z.number().int().nonnegative(),
  productLines: z.number().int().nonnegative(),
  purchaseOrderLines: z.number().int().nonnegative(),
  stockMovements: z.number().int().nonnegative(),
});

export type PartMergePreview = z.infer<typeof PartMergePreview>;
export const PartMergePreview = z.object({
  blockers: z.array(PartMergeBlocker),
  /** The survivor's average once both ledgers replay as one. */
  combinedAverageUnitCost: InventoryCost,
  combinedOnHand: z.number(),
  /** The duplicate's own recipe, dropped because the survivor keeps its BOM. */
  droppedBomLineCount: z.number().int().nonnegative(),
  moved: PartMergeMovedCounts,
  source: PartMergeSide,
  summed: z.array(PartMergeSummedLine),
  target: PartMergeSide,
  unitOfMeasure: PartUnitOfMeasure,
});

export const PartMergePreviewCostFields = declareInventoryCostFields(PartMergePreview, 'combinedAverageUnitCost');
