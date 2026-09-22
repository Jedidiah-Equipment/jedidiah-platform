export type MarkedUpUnitPrice =
  | { reason: null; unitPrice: number }
  /** No price can be offered. Never zero-as-a-price: the caller leaves the row unpriced and says why. */
  | { reason: 'no-cost' | 'no-markup'; unitPrice: null };

/**
 * A Part's sell price per costing basis unit: its moving average marked up by its Part Category.
 * Unrounded, because a linear Part's basis is one millimetre and a cent is far too coarse for it;
 * whoever multiplies this out to a row price does the rounding.
 */
export function applyPartCategoryMarkup({
  averageUnitCost,
  markupPercent,
}: {
  averageUnitCost: number | null;
  markupPercent: number | null;
}): MarkedUpUnitPrice {
  if (averageUnitCost === null) return { reason: 'no-cost', unitPrice: null };
  if (markupPercent === null) return { reason: 'no-markup', unitPrice: null };

  return { reason: null, unitPrice: averageUnitCost * (1 + markupPercent / 100) };
}
