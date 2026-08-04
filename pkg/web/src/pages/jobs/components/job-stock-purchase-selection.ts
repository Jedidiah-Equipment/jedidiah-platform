import type { JobStockRow } from '@pkg/schema';

import type { PurchaseSelectionCandidate } from '../../inventory/components/CreatePurchaseOrdersDialog.js';

type JobStockPurchaseRow = Pick<
  JobStockRow,
  | 'committedQuantity'
  | 'freeQuantity'
  | 'isInternallyFabricated'
  | 'onOrder'
  | 'partCode'
  | 'partId'
  | 'partName'
  | 'supplierName'
  | 'unitOfMeasure'
>;

/**
 * The Parts a Job still needs bought: its own outstanding commitment, with free stock and what is
 * already on order netted off (spec §3, §4).
 *
 * On order is netted for the same reason the buy list nets it. A Job committed to six, with four
 * free on the shelf and three already coming, needs none — and leaving it out here would let this
 * tab re-order what an open Purchase Order already covers while the buy list says zero. Built Parts
 * drop out entirely; they are made, not bought.
 */
export function toJobStockPurchaseCandidates(items: readonly JobStockPurchaseRow[]): PurchaseSelectionCandidate[] {
  return items.flatMap((item) => {
    if (item.committedQuantity <= 0 || item.isInternallyFabricated) return [];

    return [
      {
        partCode: item.partCode,
        partId: item.partId,
        partName: item.partName,
        suggestedQuantity: Math.max(0, item.committedQuantity - item.freeQuantity - item.onOrder),
        supplierName: item.supplierName,
        unitOfMeasure: item.unitOfMeasure,
      },
    ];
  });
}
