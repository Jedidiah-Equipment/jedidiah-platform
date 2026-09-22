/** Rounds rands to cents, tolerating float noise such as `10.075 * 100 = 1007.4999…`. */
export function roundToCents(amount: number): number {
  const cents = amount * 100;
  const roundingTolerance = Number.EPSILON * Math.abs(cents);

  return Math.round(cents + roundingTolerance) / 100;
}

/** Converts the current moving average into an editable PO default; zero preserves the unpriced sentinel. */
export function defaultPurchaseOrderUnitPrice({
  averageUnitCost,
  standardPurchaseLengthMm,
}: {
  averageUnitCost: number | null;
  standardPurchaseLengthMm: number | null;
}): number {
  if (averageUnitCost === null) return 0;

  return roundToCents(averageUnitCost * (standardPurchaseLengthMm ?? 1));
}
