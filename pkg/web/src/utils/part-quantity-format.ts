import { formatNumber } from '@pkg/domain';
import { PART_UNIT_OF_MEASURE_LABELS, type PartUnitOfMeasure } from '@pkg/schema';

export type PartQuantityUnitDisplay = {
  label: string;
  suffix: string;
};

const UNIT_SUFFIXES = {
  box: 'box',
  kg: 'kg',
  litre: 'L',
  mm: 'mm',
  pair: 'pair',
  piece: 'pc',
  set: 'set',
} as const satisfies Record<PartUnitOfMeasure, string>;

export function getPartQuantityUnitDisplay(unitOfMeasure: PartUnitOfMeasure | undefined): PartQuantityUnitDisplay {
  const unit = unitOfMeasure ?? 'piece';

  return { label: PART_UNIT_OF_MEASURE_LABELS[unit], suffix: UNIT_SUFFIXES[unit] };
}

/**
 * A linear Part's quantity is a count of pieces, never a length (spec §2) — `mm` marks the class the
 * bucket length is measured in. Callers holding a linear quantity use this rather than the suffix.
 */
export function formatPartQuantity(quantity: number, unitOfMeasure: PartUnitOfMeasure): string {
  if (unitOfMeasure === 'mm') {
    return `${formatNumber(quantity, { decimals: 0 })} pieces`;
  }

  return `${quantity} ${UNIT_SUFFIXES[unitOfMeasure]}`;
}

/** Metres are display formatting of `mm`, never a second unit (spec §2). */
export function formatLengthMetres(lengthMm: number): string {
  return `${formatNumber(lengthMm / 1_000, { decimals: lengthMm % 1_000 === 0 ? 0 : 1 })} m`;
}

/** One length bucket of linear stock, read as "6 m x 3". */
export function formatLengthBucket(lengthMm: number, quantity: number): string {
  return `${formatLengthMetres(lengthMm)} × ${formatNumber(quantity, { decimals: 0 })}`;
}
