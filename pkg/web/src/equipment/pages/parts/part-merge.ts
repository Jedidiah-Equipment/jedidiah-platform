import { formatCurrency, formatNumber } from '@pkg/domain';
import { formatPartQuantity } from '@pkg/domain/equipment';
import type { PartMergeBlocker, PartMergePreview } from '@pkg/schema/equipment';
import { STOCKTAKE_SCOPE_LABELS } from '@pkg/schema/equipment';

/** Each blocker as the one thing the user does before trying again. */
export function describePartMergeBlocker(blocker: PartMergeBlocker): string {
  switch (blocker.kind) {
    case 'unit-of-measure':
      return 'The Parts use different units of measure.';
    case 'standard-purchase-length':
      return 'The Parts have different Standard Purchase Lengths.';
    case 'stock-tracking-mode':
      return 'One Part is perpetual and the other periodic. Give them the same Stock Tracking Mode first.';
    case 'built-part':
      return 'One Part is a Built Part and the other is bought.';
    case 'open-order-supplier':
      return `${blocker.purchaseOrderCodes.join(', ')} ${blocker.purchaseOrderCodes.length === 1 ? 'is' : 'are'} still open with a different Supplier. Send or cancel ${blocker.purchaseOrderCodes.length === 1 ? 'it' : 'them'} first.`;
    case 'same-purchase-order':
      return `Both Parts are on ${blocker.purchaseOrderCodes.join(', ')}. Remove one of the lines first.`;
    case 'bom-link':
      return 'One Part is in the other’s Bill of Materials.';
    case 'open-stocktake':
      return `Close the ${STOCKTAKE_SCOPE_LABELS[blocker.scope]} stocktake first.`;
  }
}

export function formatPartMergeMoves({ moved, source, target }: PartMergePreview): string {
  const counts = [
    count(moved.stockMovements, 'stock movement'),
    count(moved.purchaseOrderLines, 'purchase order line'),
    count(moved.bomLines, 'BOM line'),
    count(moved.productLines, 'product line'),
    count(moved.jobs, 'job'),
  ];
  const listed = `${counts.slice(0, -1).join(', ')} and ${counts.at(-1)}`;

  return `${listed} will move to ${target.code}. ${source.code} will be deleted and its label will no longer scan. This cannot be undone.`;
}

/** The two sides and the result. Cost is null for a reader without cost access, and then stays unshown. */
export function formatPartMergeStock(preview: PartMergePreview) {
  const row = (label: string, onHand: number, average: number | null) => ({
    average: average === null ? null : formatCurrency(average),
    label,
    onHand: formatPartQuantity(onHand, preview.unitOfMeasure),
  });

  return [
    row(preview.source.code, preview.source.onHand, preview.source.averageUnitCost),
    row(preview.target.code, preview.target.onHand, preview.target.averageUnitCost),
    row('After merge', preview.combinedOnHand, preview.combinedAverageUnitCost),
  ];
}

function count(value: number, noun: string): string {
  return `${formatNumber(value)} ${noun}${value === 1 ? '' : 's'}`;
}
