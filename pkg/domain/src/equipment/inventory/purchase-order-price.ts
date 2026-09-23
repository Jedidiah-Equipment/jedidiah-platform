import { roundToCents } from '../../formatting/money.js';

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
