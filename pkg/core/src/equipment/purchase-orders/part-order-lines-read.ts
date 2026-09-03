import { purchaseOrderLines, purchaseOrders, supplier } from '@pkg/db';
import { compareNullableDateOnly } from '@pkg/domain';
import type { PartPurchaseOrderLineResult, UUID } from '@pkg/schema';
import { PartPurchaseOrderLineResult as PartPurchaseOrderLineResultSchema } from '@pkg/schema';
import { and, eq } from 'drizzle-orm';

import { loadReceivedQuantities, type PurchaseOrderDb, receivedQuantityKey } from './purchase-order-service.js';
import { loadReceiptBuckets, receiptBucketKey } from './receipt-pool.js';

/**
 * Every sent Purchase Order line carrying one Part, with what has arrived against it.
 *
 * This is the read behind both of the tablet's dock flows, and one read rather than two on purpose:
 * receiving wants the lines still owing, and a return to Supplier wants the lines that have taken
 * something in — which are overlapping, not disjoint, sets. A line received in full still takes a
 * return (that is what "defective" means), and a line half received can do both on the same
 * delivery. Splitting them would have made the tablet ask twice and still get the overlap wrong.
 *
 * Closed-short orders stay in, carrying `closedShortAt` so the caller can tell them apart: closing
 * short says nothing more is *coming*, not that what already arrived is beyond question (spec §4).
 * So a closed-short line still takes returns while refusing receipts — and a receiving surface that
 * filtered on outstanding quantity alone would offer exactly those lines and then fail on the post.
 */
export async function listPartPurchaseOrderLines({
  db,
  partId,
}: {
  db: PurchaseOrderDb;
  partId: UUID;
}): Promise<PartPurchaseOrderLineResult> {
  const lines = await db
    .select({
      closedShortAt: purchaseOrders.closedShortAt,
      expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
      orderedQuantity: purchaseOrderLines.quantity,
      purchaseOrderCode: purchaseOrders.code,
      purchaseOrderId: purchaseOrders.id,
      supplierName: supplier.companyName,
    })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId))
    .innerJoin(supplier, eq(supplier.id, purchaseOrders.supplierId))
    .where(and(eq(purchaseOrderLines.partId, partId), eq(purchaseOrders.status, 'sent')));

  const purchaseOrderIds = [...new Set(lines.map((line) => line.purchaseOrderId))];
  const [received, receiptBuckets] = await Promise.all([
    loadReceivedQuantities({ db, purchaseOrderIds }),
    loadReceiptBuckets({ db, purchaseOrderIds }),
  ]);

  return PartPurchaseOrderLineResultSchema.parse({
    items: lines
      .map((line) => {
        const receivedQuantity = received.get(receivedQuantityKey(line.purchaseOrderId, partId)) ?? 0;

        return {
          ...line,
          outstandingQuantity: Math.max(0, line.orderedQuantity - receivedQuantity),
          receiptBuckets: receiptBuckets.get(receiptBucketKey(line.purchaseOrderId, partId)) ?? [],
          receivedQuantity,
        };
      })
      // Earliest promised first, unpromised last — the same order the buy list names cover in, so
      // the dock reaches for the order most likely to be the delivery in front of it.
      .sort(
        (left, right) =>
          compareNullableDateOnly(left.expectedDeliveryDate, right.expectedDeliveryDate) ||
          left.purchaseOrderCode - right.purchaseOrderCode,
      ),
  });
}
