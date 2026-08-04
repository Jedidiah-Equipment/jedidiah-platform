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
  | 'standardPurchaseLengthMm'
  | 'supplierName'
  | 'unitOfMeasure'
>;

/**
 * The Parts a Job still needs bought: this Job's share of the plant's shortfall, less what is
 * already on order (spec §3, §4).
 *
 * **Free Stock already has this Job's own commitment subtracted from it.** `freeQuantity` is
 * `SOH − Σ every open commitment`, so `committed − free` would subtract the Job's demand twice: a
 * Job committed to six with six on the shelf reads `free = 0` and would ask for six more, when what
 * it needs is nothing. Negative free *is* the plant's shortfall, and this Job can only be asked to
 * cover its own commitment of it — hence `min(−free, committed)`. On order comes off for the same
 * reason the buy list nets it: without it, this tab would re-order what a sent order already covers
 * while the buy list says zero. Built Parts drop out entirely; they are made, not bought.
 */
export function toJobStockPurchaseCandidates(items: readonly JobStockPurchaseRow[]): PurchaseSelectionCandidate[] {
  return items.flatMap((item) => {
    if (item.committedQuantity <= 0 || item.isInternallyFabricated) return [];

    return [
      {
        partCode: item.partCode,
        partId: item.partId,
        partName: item.partName,
        standardPurchaseLengthMm: item.standardPurchaseLengthMm,
        suggestedQuantity: Math.max(0, Math.min(-item.freeQuantity, item.committedQuantity) - item.onOrder),
        supplierName: item.supplierName,
        unitOfMeasure: item.unitOfMeasure,
      },
    ];
  });
}
