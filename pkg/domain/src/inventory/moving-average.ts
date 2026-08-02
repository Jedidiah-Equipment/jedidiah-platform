import type { StockAdjustmentReason } from '@pkg/schema';

export type MovingAverageMovement = {
  delta: number;
  lengthMm: number | null;
  movementType: 'adjustment' | 'receipt' | 'revaluation';
  reason: StockAdjustmentReason | null;
  unitCost: number | null;
};

/**
 * Replays ledger order. Quantity-only rows matter because the next receipt is weighted against
 * stock that is still on hand, even though those rows do not establish a cost themselves.
 */
export function deriveMovingAverage(orderedMovements: readonly MovingAverageMovement[]): number | null {
  return deriveMovingAverageTimeline(orderedMovements).at(-1) ?? null;
}

export function deriveMovingAverageTimeline(orderedMovements: readonly MovingAverageMovement[]): Array<number | null> {
  let averageUnitCost: number | null = null;
  let quantityOnHand = 0;
  const timeline: Array<number | null> = [];

  for (const movement of orderedMovements) {
    if (movement.movementType === 'revaluation') {
      averageUnitCost = movement.unitCost;
      timeline.push(averageUnitCost);
      continue;
    }

    const basisQuantity = movement.delta * (movement.lengthMm ?? 1);
    const unitCost = movement.unitCost;
    const establishesWeightedCost =
      unitCost !== null &&
      (movement.movementType === 'receipt' ||
        (movement.movementType === 'adjustment' && movement.reason === 'opening-balance'));

    if (establishesWeightedCost && unitCost !== null) {
      const costPerBasisUnit = movement.lengthMm === null ? unitCost : unitCost / movement.lengthMm;
      const previousQuantity = Math.max(0, quantityOnHand);
      const nextQuantity = previousQuantity + basisQuantity;

      if (averageUnitCost === null || previousQuantity === 0 || nextQuantity <= 0) {
        averageUnitCost = costPerBasisUnit;
      } else {
        averageUnitCost = (previousQuantity * averageUnitCost + basisQuantity * costPerBasisUnit) / nextQuantity;
      }
    }

    quantityOnHand += basisQuantity;
    timeline.push(averageUnitCost);
  }

  return timeline;
}

export function valueStockBucket({
  averageUnitCost,
  lengthMm,
  quantity,
}: {
  averageUnitCost: number | null;
  lengthMm: number | null;
  quantity: number;
}): number | null {
  if (averageUnitCost === null) {
    return null;
  }

  return quantity * (lengthMm ?? 1) * averageUnitCost;
}

export function valueStockMovement({
  averageUnitCost,
  delta,
  lengthMm,
  unitCost,
}: {
  averageUnitCost: number | null;
  delta: number;
  lengthMm: number | null;
  unitCost: number | null;
}): number | null {
  if (unitCost !== null) {
    return delta * unitCost;
  }

  return valueStockBucket({ averageUnitCost, lengthMm, quantity: delta });
}
