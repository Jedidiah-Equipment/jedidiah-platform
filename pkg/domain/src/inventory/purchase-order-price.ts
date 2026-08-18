/** Converts the current moving average into an editable PO default; zero preserves the unpriced sentinel. */
export function defaultPurchaseOrderUnitPrice({
  averageUnitCost,
  standardPurchaseLengthMm,
}: {
  averageUnitCost: number | null;
  standardPurchaseLengthMm: number | null;
}): number {
  if (averageUnitCost === null) return 0;

  const purchaseUnitCost = averageUnitCost * (standardPurchaseLengthMm ?? 1);

  const purchaseUnitCostInCents = purchaseUnitCost * 100;
  const roundingTolerance = Number.EPSILON * Math.abs(purchaseUnitCostInCents);

  return Math.round(purchaseUnitCostInCents + roundingTolerance) / 100;
}
