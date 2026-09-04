import { z } from 'zod';

import { AuthId } from '../../auth/auth-id.js';
import { DateIso } from '../../common/date.js';
import { UUID } from '../../common/uuid.js';
import { declareInventoryCostFields, InventoryCost } from './inventory-cost.js';
import {
  AssertedActorUserId,
  StockMovementLengthMm,
  StockMovementQuantity,
  StockMovementWarningCode,
} from './stock-movement.js';

/** How many units of the Built Part came off the rack. There is no planned build — you build what you built. */
export type BuildQuantity = z.infer<typeof BuildQuantity>;
export const BuildQuantity = StockMovementQuantity;

/**
 * One component actually consumed. Prefilled at BOM × N and edited to what really left the rack, so
 * a line may deviate from the BOM in either direction, or be dropped entirely.
 */
export type BuildConsumptionInput = z.infer<typeof BuildConsumptionInput>;
export const BuildConsumptionInput = z
  .object({
    componentPartId: UUID,
    lengthMm: StockMovementLengthMm.nullable().default(null),
    quantity: StockMovementQuantity,
  })
  .strict();

export type PostBuildInput = z.infer<typeof PostBuildInput>;
export const PostBuildInput = z
  .object({
    actorUserId: AssertedActorUserId,
    builtPartId: UUID,
    /** Empty is legitimate — the trivial build of a Part whose BOM is raw material only. */
    consumption: z.array(BuildConsumptionInput),
    quantity: BuildQuantity,
  })
  .strict()
  .superRefine((input, context) => {
    // One line per component, like the BOM it prefills from. Without this a component could arrive
    // twice, and each line would be judged against the full BOM expectation and against a stock
    // figure the other line had already moved — making the posted warnings depend on array order.
    // Consuming one component out of two length buckets is not a v1 concept; if it arrives it is a
    // shape change to the line, not a second line.
    const seen = new Set<string>();

    for (const [index, line] of input.consumption.entries()) {
      if (seen.has(line.componentPartId)) {
        context.addIssue({
          code: 'custom',
          message: 'This component is already on the build',
          path: ['consumption', index, 'componentPartId'],
        });
      }
      seen.add(line.componentPartId);
    }
  });

export type StockBuild = z.infer<typeof StockBuild>;
export const StockBuild = z.object({
  actorUserId: AuthId,
  builtPartId: UUID,
  createdAt: DateIso,
  id: UUID,
  quantity: BuildQuantity,
});

export type BuildComponentWarning = z.infer<typeof BuildComponentWarning>;
export const BuildComponentWarning = z.object({
  codes: z.array(StockMovementWarningCode).min(1),
  componentPartId: UUID,
});

export type BuildPostResult = z.infer<typeof BuildPostResult>;
export const BuildPostResult = z.object({
  build: StockBuild,
  /** The cost stamped on the produce row, derived from what the build consumed. */
  producedUnitCost: InventoryCost,
  warnings: z.array(BuildComponentWarning),
});

export const BuildPostResultCostFields = declareInventoryCostFields(BuildPostResult, 'producedUnitCost');
