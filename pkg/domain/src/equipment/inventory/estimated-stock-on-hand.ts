import type { EstimatedStockOnHand, PartUnitOfMeasure } from '@pkg/schema';

export function deriveEstimatedStockOnHand({
  cumulativeDemandAtAnchor,
  cumulativeDemandNow,
  recordedOnHand,
  utilization,
}: {
  cumulativeDemandAtAnchor: number;
  cumulativeDemandNow: number;
  recordedOnHand: number;
  utilization: number;
}): EstimatedStockOnHand {
  const openedAtAnchor = platesOpened(cumulativeDemandAtAnchor, utilization);
  const openedNow = platesOpened(cumulativeDemandNow, utilization);
  const consumedOnOpenPlate = cumulativeDemandNow - utilization * (openedNow - 1);
  const isExactMultiple = openedNow > 0 && approximatelyEqual(consumedOnOpenPlate, utilization);

  return {
    openPlateRemainingPercent: openedNow === 0 || isExactMultiple ? null : Math.round(100 - consumedOnOpenPlate * 100),
    wholeUnits: Math.max(0, recordedOnHand - (openedNow - openedAtAnchor)),
  };
}

export function formatEstimatedStockOnHand(estimate: EstimatedStockOnHand, unitOfMeasure: PartUnitOfMeasure): string {
  const whole = `${estimate.wholeUnits} ${estimateUnitNoun(unitOfMeasure, estimate.wholeUnits)}`;
  const remainder =
    estimate.openPlateRemainingPercent === null ? '' : ` + ${estimate.openPlateRemainingPercent}% of one`;

  return `≈ ${whole}${remainder}.`;
}

function estimateUnitNoun(unitOfMeasure: PartUnitOfMeasure, quantity: number): string {
  switch (unitOfMeasure) {
    case 'piece':
      return quantity === 1 ? 'plate' : 'plates';
    case 'box':
      return quantity === 1 ? 'box' : 'boxes';
    case 'pair':
      return quantity === 1 ? 'pair' : 'pairs';
    case 'set':
      return quantity === 1 ? 'set' : 'sets';
    default:
      throw new Error(`Estimated Stock on Hand cannot format the ${unitOfMeasure} unit`);
  }
}

function platesOpened(demand: number, utilization: number): number {
  if (demand <= 0) return 0;

  // Quantities are decimal inputs, but their quotient is binary floating point. Subtracting this
  // tolerance keeps an exact utilization boundary from spuriously opening the next plate.
  return Math.ceil(demand / utilization - 1e-10);
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-10;
}
