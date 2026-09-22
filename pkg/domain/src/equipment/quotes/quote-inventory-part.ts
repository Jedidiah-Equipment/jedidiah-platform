import type { PartUnitOfMeasure } from '@pkg/schema/equipment';
import { unitClassFor } from '@pkg/schema/equipment';

import { roundToCents } from '../inventory/purchase-order-price.js';

/** What one Work Item Part row of this Part is a quantity of. */
export type QuoteInventoryPartBasis = 'unit' | 'length' | 'plate';

export function quoteInventoryPartBasis(part: {
  averageUtilizationPercent: number | null;
  unitOfMeasure: PartUnitOfMeasure;
}): QuoteInventoryPartBasis {
  if (unitClassFor(part.unitOfMeasure) === 'linear') return 'length';

  return part.averageUtilizationPercent === null ? 'unit' : 'plate';
}

export type QuoteInventoryPartAmount =
  | { basis: 'unit' }
  | { basis: 'length'; lengthMm: number }
  /** `platePercent` is part area ÷ plate area with no waste, the Product Material List convention. */
  | { averageUtilizationPercent: number; basis: 'plate'; platePercent: number };

/** The share of a plate a sale consumes once scrap is counted: area ÷ yield. */
export function effectivePlateFraction(platePercent: number, averageUtilizationPercent: number): number {
  return platePercent / averageUtilizationPercent;
}

/**
 * The unit price one pre-filled row carries. `sellPricePerBasisUnit` is per millimetre for a length,
 * per whole plate for a plate, per counting unit otherwise, and unrounded; this is where it becomes
 * rands and cents. Null in, zero out: zero is the row's "unpriced" value, and the caller says why.
 */
export function quoteInventoryPartUnitPrice({
  amount,
  sellPricePerBasisUnit,
}: {
  amount: QuoteInventoryPartAmount;
  sellPricePerBasisUnit: number | null;
}): number {
  if (sellPricePerBasisUnit === null) return 0;

  const multiplier =
    amount.basis === 'length'
      ? amount.lengthMm
      : amount.basis === 'plate'
        ? effectivePlateFraction(amount.platePercent, amount.averageUtilizationPercent)
        : 1;

  return roundToCents(sellPricePerBasisUnit * multiplier);
}

export function quoteInventoryPartName(part: { name: string }, amount: QuoteInventoryPartAmount): string {
  return amount.basis === 'length' ? `${part.name} (${amount.lengthMm} mm)` : part.name;
}
