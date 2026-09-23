import { purchaseOrderLines, purchaseOrders, supplier } from '@pkg/db/equipment';
import { compareNullableDateOnly, derivePurchaseOrderActions, purchaseOrderActionFacts } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import type { PartPurchaseOrderLineResult } from '@pkg/schema/equipment';
import { PartPurchaseOrderLineResult as PartPurchaseOrderLineResultSchema } from '@pkg/schema/equipment';
import { and, eq, inArray } from 'drizzle-orm';

import { loadLineIntake } from './purchase-order-line-intake.js';
import type { PurchaseOrderDb } from './purchase-order-service.js';
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
      lineId: purchaseOrderLines.id,
      orderedQuantity: purchaseOrderLines.quantity,
      purchaseOrderCode: purchaseOrders.code,
      purchaseOrderId: purchaseOrders.id,
      status: purchaseOrders.status,
      supplierName: supplier.companyName,
    })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId))
    .innerJoin(supplier, eq(supplier.id, purchaseOrders.supplierId))
    .where(and(eq(purchaseOrderLines.partId, partId), eq(purchaseOrders.status, 'sent')));

  const purchaseOrderIds = [...new Set(lines.map((line) => line.purchaseOrderId))];
  const [received, receiptBuckets, orderLines] = await Promise.all([
    loadLineIntake({ db, purchaseOrderIds }),
    loadReceiptBuckets({ db, purchaseOrderIds }),
    purchaseOrderIds.length === 0
      ? []
      : db
          .select({
            id: purchaseOrderLines.id,
            purchaseOrderId: purchaseOrderLines.purchaseOrderId,
            quantity: purchaseOrderLines.quantity,
          })
          .from(purchaseOrderLines)
          .where(inArray(purchaseOrderLines.purchaseOrderId, purchaseOrderIds)),
  ]);
  // Judged on the whole order, not the scanned Part's line alone: history and remainder are the order's.
  const orderActionsFor = (line: (typeof lines)[number]) => {
    const { receive, returnToSupplier } = derivePurchaseOrderActions(
      purchaseOrderActionFacts({
        row: line,
        lines: orderLines.filter((candidate) => candidate.purchaseOrderId === line.purchaseOrderId),
        intake: received,
      }),
    );
    return { receive, returnToSupplier };
  };

  return PartPurchaseOrderLineResultSchema.parse({
    items: lines
      .map((row) => {
        const { closedShortAt: _closedShortAt, lineId, status: _status, ...line } = row;
        const receivedQuantity = received.get(lineId) ?? 0;

        return {
          ...line,
          orderActions: orderActionsFor(row),
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
