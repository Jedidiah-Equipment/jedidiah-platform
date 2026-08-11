import { type DatabaseTransaction, type Db, stockMovements } from '@pkg/db';
import type { PurchaseOrderReceiptBucket, UUID } from '@pkg/schema';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * The movements that make up what a line still holds. Both directions, every return reason: a
 * return sends stock back off the line whatever it was owed in its place, so the pool nets it out
 * regardless. Which reasons re-open the *order* is a separate question, answered by the netted
 * `receivedQuantity` the derived states read.
 */
export const RECEIPT_POOL_MOVEMENT_TYPES = ['receipt', 'return-to-supplier'] as const;

export type ReceiptPoolDb = Db | DatabaseTransaction;

/** `${purchaseOrderId}:${partId}` — one line's buckets. */
export function receiptBucketKey(purchaseOrderId: UUID, partId: UUID): string {
  return `${purchaseOrderId}:${partId}`;
}

/**
 * What each line can still send back, per length bucket. This is the served half of the Return to
 * Supplier judgement: the post sums the same movement types over the same bucket when it takes its
 * lock, so a surface previewing from this reaches the same verdict the post will. Read it rather
 * than recomputing a threshold from netted totals — that is what let the browser and the tablet
 * disagree with the ledger about a line received in two lengths.
 *
 * Buckets are not floored: a line returned past what it took in reads negative here and warns on
 * the preview, which is exactly what the post does with it.
 */
export async function loadReceiptBuckets({
  db,
  purchaseOrderIds,
}: {
  db: ReceiptPoolDb;
  purchaseOrderIds: readonly UUID[];
}): Promise<Map<string, PurchaseOrderReceiptBucket[]>> {
  if (purchaseOrderIds.length === 0) return new Map();

  const rows = await db
    .select({
      lengthMm: stockMovements.lengthMm,
      outstandingReceivedQuantity: stockMovements.delta,
      partId: stockMovements.partId,
      purchaseOrderId: stockMovements.purchaseOrderId,
    })
    .from(stockMovements)
    .where(
      and(
        inArray(stockMovements.purchaseOrderId, [...purchaseOrderIds]),
        inArray(stockMovements.movementType, [...RECEIPT_POOL_MOVEMENT_TYPES]),
      ),
    );

  const byLine = new Map<string, PurchaseOrderReceiptBucket[]>();

  for (const row of rows) {
    if (row.purchaseOrderId === null) continue;

    const key = receiptBucketKey(row.purchaseOrderId, row.partId);
    const buckets = byLine.get(key) ?? [];
    const bucket = buckets.find((candidate) => candidate.lengthMm === row.lengthMm);

    if (bucket) {
      bucket.outstandingReceivedQuantity += row.outstandingReceivedQuantity;
    } else {
      buckets.push({ lengthMm: row.lengthMm, outstandingReceivedQuantity: row.outstandingReceivedQuantity });
    }

    byLine.set(key, buckets);
  }

  for (const buckets of byLine.values()) {
    buckets.sort((left, right) => (left.lengthMm ?? 0) - (right.lengthMm ?? 0));
  }

  return byLine;
}
