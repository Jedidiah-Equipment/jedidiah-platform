import type { JobStockRow, StockOnHandRow } from '@pkg/schema';

import type { SeedPurchaseOrderCandidate } from '../../inventory/components/SeedPurchaseOrdersDialog.js';

type JobStockSeedRow = Pick<JobStockRow, 'committedQuantity' | 'partCode' | 'partId' | 'partName' | 'unitOfMeasure'>;
type FreeStockRow = Pick<StockOnHandRow, 'free' | 'isInternallyFabricated' | 'partId'>;

/**
 * The Parts a Job still needs bought, seeded from its own outstanding commitment with free stock
 * alongside (spec §4).
 *
 * Free stock is what makes the suggestion honest: a Job committed to six with four free on the
 * shelf needs two, not six. Negative free is already counted — the shortfall is `committed − free`
 * either way. Built Parts drop out entirely; they are made, not bought.
 */
export function toJobStockSeedCandidates({
  items,
  stockOnHand,
}: {
  items: readonly JobStockSeedRow[];
  stockOnHand: readonly FreeStockRow[];
}): SeedPurchaseOrderCandidate[] {
  const stockByPart = new Map(stockOnHand.map((row) => [row.partId, row]));

  return items.flatMap((item) => {
    const stock = stockByPart.get(item.partId);
    if (item.committedQuantity <= 0 || stock?.isInternallyFabricated) return [];

    return [
      {
        partCode: item.partCode,
        partId: item.partId,
        partName: item.partName,
        suggestedQuantity: Math.max(0, item.committedQuantity - (stock?.free ?? 0)),
        supplierName: null,
        unitOfMeasure: item.unitOfMeasure,
      },
    ];
  });
}
