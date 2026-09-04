import type { InvoicePriceCorrection } from '@pkg/schema/equipment';

/**
 * What confirming an invoiced price does to a Part's moving average (spec §5).
 *
 * Movements are immutable, so a receipt posted at the wrong price is never rewritten — the
 * correction is a `revaluation` that moves the average by exactly the value the receipts got wrong,
 * spread over what is still on the shelf:
 *
 *     newAverage = average + (invoiced − receipted) × receivedQuantity ÷ stockOnHandBasis
 *
 * The two quantities are deliberately in different units, because the average is. A price is agreed
 * per *piece* — per length for linear material — while the average a linear Part carries is per
 * millimetre (`deriveMovingAverage`). So the numerator is a rand value (a per-piece difference over
 * the pieces received) and the denominator is the basis quantity the average is expressed per:
 * `Σ(delta × lengthMm)` for linear stock, and simply the count for everything else, where the two
 * are the same number.
 *
 * The guard is the interesting part. With nothing on hand the difference has nothing to attach to:
 * the stock has already been drawn at the old price and gone to Jobs, whose costs are stamped and
 * must not drift. There is no honest revaluation to post, so the panel says so instead.
 */

export function deriveInvoicePriceCorrection({
  averageUnitCost,
  invoicedUnitCost,
  receiptedUnitCost,
  receivedQuantity,
  stockOnHandBasis,
}: {
  averageUnitCost: number | null;
  invoicedUnitCost: number | null;
  receiptedUnitCost: number | null;
  /** Pieces received against the line — the unit the invoiced and receipted prices are per. */
  receivedQuantity: number;
  /** Stock on hand in the unit the average is per: millimetres for linear stock, pieces otherwise. */
  stockOnHandBasis: number;
}): InvoicePriceCorrection {
  const base = {
    averageUnitCost,
    newAverageUnitCost: null,
    receiptedUnitCost,
    receivedQuantity,
    stockOnHandBasis,
  };

  if (
    averageUnitCost === null ||
    invoicedUnitCost === null ||
    receiptedUnitCost === null ||
    receivedQuantity <= 0 ||
    stockOnHandBasis <= 0
  ) {
    return { ...base, canApply: false };
  }

  // Floored at zero: the ledger refuses a negative unit cost, and a credit large enough to push the
  // average through the floor has taken the remaining stock down to worthless, not below it.
  const newAverageUnitCost = Math.max(
    0,
    averageUnitCost + ((invoicedUnitCost - receiptedUnitCost) * receivedQuantity) / stockOnHandBasis,
  );

  return { ...base, canApply: true, newAverageUnitCost };
}
