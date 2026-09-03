import { isWholeUnitQuantity, type PartUnitClass } from '@pkg/schema';

import { StockMovementDeltaError, StockMovementLengthError } from './stock-movement-errors.js';

/**
 * The two rules every ledger write shares, whatever posted it: a Part is counted in the units its
 * class allows, and a linear Part is always cut from a length bucket while nothing else has one.
 */

export function assertDeltaMatchesUnitClass(delta: number, unitClass: PartUnitClass): void {
  if (!isWholeUnitQuantity(delta, unitClass)) {
    throw new StockMovementDeltaError(unitClass);
  }
}

export function assertLengthMatchesUnitClass(lengthMm: number | null, unitClass: PartUnitClass): void {
  if (unitClass === 'linear' && lengthMm === null) {
    throw new StockMovementLengthError(true);
  }

  if (unitClass !== 'linear' && lengthMm !== null) {
    throw new StockMovementLengthError(false);
  }
}
