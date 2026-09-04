import { deriveMovementWarnings } from '@pkg/domain/equipment';
import type {
  JobStockMovementType,
  JobStockResult,
  PartPurchaseOrderLine,
  StockMovementWarningCode,
  StockOnHandRow,
} from '@pkg/schema/equipment';

/**
 * What the ledger would say about a movement the tablet is about to post, judged against the facts
 * the server served rather than a threshold computed here. Pure and kept out of the screens so the
 * three of them resolve a length bucket the one way — and so the judgement can be tested without
 * standing up a screen.
 *
 * Silence while the facts are still loading is deliberate: every figure would read zero, which warns
 * on any movement at all. The post returns the real verdict either way.
 */
export function previewJobMovementWarnings({
  jobStock,
  lengthMm,
  movementType,
  quantity,
  row,
}: {
  jobStock: JobStockResult | undefined;
  lengthMm: number | null;
  movementType: JobStockMovementType;
  quantity: number | null;
  row: StockOnHandRow;
}): StockMovementWarningCode[] {
  if (quantity === null || jobStock === undefined) return [];

  const partStock = jobStock.items.find((item) => item.partId === row.partId);

  return deriveMovementWarnings({
    facts: {
      bucketQuantityOnHand: row.buckets.find((bucket) => bucket.lengthMm === lengthMm)?.quantity ?? 0,
      cfoQuantity: partStock?.cfoQuantity ?? 0,
      // A movement with no length names the Part's whole draw; the Job's buckets carry only lengths.
      drawnBucketQuantity:
        lengthMm === null
          ? (partStock?.drawnQuantity ?? 0)
          : (partStock?.lengthBuckets.find((bucket) => bucket.lengthMm === lengthMm)?.drawnQuantity ?? 0),
      drawnQuantity: partStock?.drawnQuantity ?? 0,
      kind: movementType,
    },
    quantity,
  });
}

/** Both facts a receipt is judged against ride the line the dock picked. */
export function previewReceiptWarnings({
  line,
  quantity,
}: {
  line: PartPurchaseOrderLine | null;
  quantity: number | null;
}): StockMovementWarningCode[] {
  if (quantity === null || line === null) return [];

  return deriveMovementWarnings({
    facts: { kind: 'receipt', orderedQuantity: line.orderedQuantity, receivedQuantity: line.receivedQuantity },
    quantity,
  });
}

/**
 * What this line can still send back in the bucket the return would post against, served per bucket
 * by the order read. Read rather than computed: netting a threshold out of Part-wide totals is what
 * let this screen disagree with the ledger about a line received in two lengths.
 */
export function previewReturnToSupplierWarnings({
  lengthMm,
  line,
  quantity,
}: {
  lengthMm: number | null;
  line: PartPurchaseOrderLine | null;
  quantity: number | null;
}): StockMovementWarningCode[] {
  if (quantity === null || line === null) return [];

  const bucket = line.receiptBuckets.find((candidate) => candidate.lengthMm === lengthMm);

  return deriveMovementWarnings({
    facts: { kind: 'return-to-supplier', outstandingReceivedQuantity: bucket?.outstandingReceivedQuantity ?? 0 },
    quantity,
  });
}
