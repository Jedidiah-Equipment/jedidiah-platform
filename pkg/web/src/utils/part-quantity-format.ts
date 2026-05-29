import { PART_UNIT_OF_MEASURE_LABELS, type PartUnitOfMeasure } from '@pkg/schema';

export type PartQuantityUnitDisplay = {
  label: string;
  suffix: string | null;
};

export function getPartQuantityUnitDisplay(unitOfMeasure: PartUnitOfMeasure | undefined): PartQuantityUnitDisplay {
  const unit = unitOfMeasure ?? 'quantity';

  return {
    label: PART_UNIT_OF_MEASURE_LABELS[unit],
    suffix: unit === 'mm' ? 'mm' : null,
  };
}

export function formatPartQuantity(quantity: number, unitOfMeasure: PartUnitOfMeasure): string {
  const unitDisplay = getPartQuantityUnitDisplay(unitOfMeasure);

  return unitDisplay.suffix ? `${quantity} ${unitDisplay.suffix}` : String(quantity);
}
