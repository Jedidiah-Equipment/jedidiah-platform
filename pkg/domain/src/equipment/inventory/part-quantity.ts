import type { PartUnitOfMeasure } from '@pkg/schema/equipment';

import { formatNumber } from '../../formatting/number.js';

export const PART_UNIT_SUFFIXES = {
  box: 'box',
  kg: 'kg',
  litre: 'L',
  mm: 'mm',
  pair: 'pair',
  piece: 'pc',
  set: 'set',
} as const satisfies Record<PartUnitOfMeasure, string>;

const MAX_QUANTITY_DECIMALS = 3;

/**
 * A linear Part's quantity is a count of pieces, never a length (spec §2) — `mm` marks the class the
 * bucket length is measured in. Callers holding a linear quantity use this rather than the suffix.
 */
export function formatPartQuantity(quantity: number, unitOfMeasure: PartUnitOfMeasure): string {
  if (unitOfMeasure === 'mm') {
    return `${formatPartQuantityValue(quantity)} pieces`;
  }

  return `${quantity} ${PART_UNIT_SUFFIXES[unitOfMeasure]}`;
}

export function formatPartQuantityValue(quantity: number): string {
  const roundedQuantity = Math.round(quantity * 10 ** MAX_QUANTITY_DECIMALS) / 10 ** MAX_QUANTITY_DECIMALS;
  const normalizedQuantity = Object.is(roundedQuantity, -0) ? 0 : roundedQuantity;
  const [coefficient = '', exponentText = '0'] = normalizedQuantity.toString().toLowerCase().split('e');
  const fractionLength = coefficient.split('.')[1]?.length ?? 0;
  const decimals = Math.min(MAX_QUANTITY_DECIMALS, Math.max(0, fractionLength - Number(exponentText)));

  return formatNumber(normalizedQuantity, { decimals });
}
