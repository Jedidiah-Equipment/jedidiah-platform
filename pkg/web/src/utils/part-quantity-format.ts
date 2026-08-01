import { PART_UNIT_OF_MEASURE_LABELS, type PartUnitOfMeasure } from '@pkg/schema';

export type PartQuantityUnitDisplay = {
  label: string;
  suffix: string;
};

export function getPartQuantityUnitDisplay(unitOfMeasure: PartUnitOfMeasure | undefined): PartQuantityUnitDisplay {
  const unit = unitOfMeasure ?? 'piece';
  const suffixes = {
    box: 'box',
    kg: 'kg',
    litre: 'L',
    mm: 'mm',
    pair: 'pair',
    piece: 'pc',
    set: 'set',
  } as const satisfies Record<PartUnitOfMeasure, string>;

  return {
    label: PART_UNIT_OF_MEASURE_LABELS[unit],
    suffix: suffixes[unit],
  };
}

export function formatPartQuantity(quantity: number, unitOfMeasure: PartUnitOfMeasure): string {
  const unitDisplay = getPartQuantityUnitDisplay(unitOfMeasure);

  return `${quantity} ${unitDisplay.suffix}`;
}
