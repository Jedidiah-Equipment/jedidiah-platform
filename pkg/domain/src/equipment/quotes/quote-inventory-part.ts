import type { PartUnitOfMeasure, QuoteInventoryPartOption } from '@pkg/schema/equipment';
import { unitClassFor } from '@pkg/schema/equipment';

import { roundToCents } from '../../formatting/money.js';
import { formatCurrency, formatNumber } from '../../formatting/number.js';
import { formatPartQuantity } from '../inventory/part-quantity.js';

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
  | { basis: 'plate'; platePercent: number };

/** The ordinary Work Item Part row a catalog Part pre-fills; it keeps no link back to the Part. */
export type QuoteInventoryPartRow = { name: string; quantity: number; unitPrice: number };

/** The share of a plate a sale consumes once scrap is counted: area ÷ yield. */
export function effectivePlateFraction(platePercent: number, averageUtilizationPercent: number): number {
  return platePercent / averageUtilizationPercent;
}

/**
 * The row the dialog's Add button commits, or null while a box the basis needs is still empty (the
 * caller keeps Add disabled). An unpriced Part lands at zero, and `quoteInventoryPartPriceNote`
 * says why.
 */
export function proposeQuoteInventoryPartRow(
  part: QuoteInventoryPartOption,
  input: { lengthMm: number | null; platePercent: number | null; quantity: number | null },
): QuoteInventoryPartRow | null {
  const amount = quoteInventoryPartAmount(part, input);
  if (amount === null || input.quantity === null) return null;

  return {
    name: quoteInventoryPartName(part, amount),
    quantity: input.quantity,
    unitPrice: part.priceNote === null ? quoteInventoryPartUnitPrice(part, amount) : 0,
  };
}

function quoteInventoryPartAmount(
  part: QuoteInventoryPartOption,
  { lengthMm, platePercent }: { lengthMm: number | null; platePercent: number | null },
): QuoteInventoryPartAmount | null {
  switch (quoteInventoryPartBasis(part)) {
    case 'length':
      return lengthMm === null ? null : { basis: 'length', lengthMm };
    case 'plate':
      return platePercent === null ? null : { basis: 'plate', platePercent };
    case 'unit':
      return { basis: 'unit' };
  }
}

/**
 * The unit price one pre-filled row carries. `sellPricePerBasisUnit` is per millimetre for a length,
 * per whole plate for a plate, per counting unit otherwise, and unrounded; this is where it becomes
 * rands and cents.
 */
export function quoteInventoryPartUnitPrice(
  part: { averageUtilizationPercent: number | null; sellPricePerBasisUnit: number },
  amount: QuoteInventoryPartAmount,
): number {
  return roundToCents(part.sellPricePerBasisUnit * amountMultiplier(part, amount));
}

function amountMultiplier(
  part: { averageUtilizationPercent: number | null },
  amount: QuoteInventoryPartAmount,
): number {
  switch (amount.basis) {
    case 'length':
      return amount.lengthMm;
    case 'plate':
      if (part.averageUtilizationPercent === null) {
        throw new Error('A plate amount needs the Part’s Average Utilization %');
      }
      return effectivePlateFraction(amount.platePercent, part.averageUtilizationPercent);
    case 'unit':
      return 1;
  }
}

export function quoteInventoryPartName(part: { name: string }, amount: QuoteInventoryPartAmount): string {
  return amount.basis === 'length' ? `${part.name} (${amount.lengthMm} mm)` : part.name;
}

/** Why an unpriced Part's row is added at zero, in the words the salesperson reads. */
export function quoteInventoryPartPriceNote(
  part: { partCategoryName: string; priceNote: 'no-cost' | 'no-markup' },
  currencyCode: string,
): string {
  const reason =
    part.priceNote === 'no-cost' ? 'This Part has no cost yet' : `${part.partCategoryName} has no markup set`;

  return `${reason}, so no price can be worked out. The row will be added at ${formatCurrency(0, currencyCode)}.`;
}

/** Shows the salesperson how a share of a plate grows once scrap is counted. */
export function formatPlateWorking(platePercent: number, averageUtilizationPercent: number): string {
  const effectivePercent = effectivePlateFraction(platePercent, averageUtilizationPercent) * 100;

  return `${platePercent}% of plate ÷ ${averageUtilizationPercent}% yield = ${formatNumber(effectivePercent, { decimals: 2 })}% of a plate`;
}

export function quoteInventoryPartQuantityLabel(basis: QuoteInventoryPartBasis): 'Pieces' | 'Quantity' {
  return basis === 'length' ? 'Pieces' : 'Quantity';
}

export function quoteInventoryPartLabel(part: { code: string; name: string }): string {
  return `${part.code} · ${part.name}`;
}

export function formatFreeStock(part: { freeQuantity: number; unitOfMeasure: PartUnitOfMeasure }): string {
  return part.freeQuantity > 0 ? `${formatPartQuantity(part.freeQuantity, part.unitOfMeasure)} free` : 'None free';
}
