import type { Db } from '@pkg/db';
import { purchaseOrderLines, purchaseOrders, supplier } from '@pkg/db/equipment';
import { diffDateOnlyDays, toPlantDateOnly } from '@pkg/domain';
import { DateOnlyIso } from '@pkg/schema';
import {
  type LatePurchaseOrderResult,
  LatePurchaseOrderResult as LatePurchaseOrderResultSchema,
} from '@pkg/schema/equipment';
import { and, asc, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm';

import { loadReceivedQuantities, receivedQuantityKey } from './purchase-order-service.js';

/**
 * Sent orders past the date they were promised for, with something still owed (spec §12).
 *
 * "Still owed" includes Custom Lines, which cannot count as Part cover on the buy list. Until
 * Arrivals are recorded for them, a sent Custom Line remains owed. A closed-short order is absent:
 * closing short is the assertion that the remainder is not coming, which is the answer this list
 * exists to prompt for. An order with no expected date was never promised for a day and so can
 * never be late — chasing it is the buy list's job, not this one's.
 */
export async function listLatePurchaseOrders({
  clock = () => new Date(),
  db,
}: {
  clock?: () => Date;
  db: Db;
}): Promise<LatePurchaseOrderResult> {
  const today = toPlantDateOnly(clock());
  const candidates = await db
    .select({
      code: purchaseOrders.code,
      expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
      id: purchaseOrders.id,
      supplierName: supplier.companyName,
    })
    .from(purchaseOrders)
    .innerJoin(supplier, eq(supplier.id, purchaseOrders.supplierId))
    .where(
      and(
        eq(purchaseOrders.status, 'sent'),
        isNull(purchaseOrders.closedShortAt),
        isNotNull(purchaseOrders.expectedDeliveryDate),
        lt(purchaseOrders.expectedDeliveryDate, today),
      ),
    )
    // Longest overdue first: the order that has kept a Job waiting the longest leads the list.
    .orderBy(asc(purchaseOrders.expectedDeliveryDate), asc(purchaseOrders.code));
  if (candidates.length === 0) return { items: [] };

  const candidateIds = candidates.map((candidate) => candidate.id);
  const [lines, receivedQuantities] = await Promise.all([
    db
      .select({
        partId: purchaseOrderLines.partId,
        purchaseOrderId: purchaseOrderLines.purchaseOrderId,
        quantity: purchaseOrderLines.quantity,
      })
      .from(purchaseOrderLines)
      .where(inArray(purchaseOrderLines.purchaseOrderId, candidateIds)),
    loadReceivedQuantities({ db, purchaseOrderIds: candidateIds }),
  ]);
  const openLineCounts = new Map<string, number>();

  for (const line of lines) {
    const received =
      line.partId === null ? 0 : (receivedQuantities.get(receivedQuantityKey(line.purchaseOrderId, line.partId)) ?? 0);
    if (line.quantity <= received) continue;
    openLineCounts.set(line.purchaseOrderId, (openLineCounts.get(line.purchaseOrderId) ?? 0) + 1);
  }

  return LatePurchaseOrderResultSchema.parse({
    items: candidates.flatMap((candidate) => {
      const openLineCount = openLineCounts.get(candidate.id) ?? 0;
      if (openLineCount === 0 || candidate.expectedDeliveryDate === null) return [];

      return [
        {
          ...candidate,
          daysLate: diffDateOnlyDays(today, DateOnlyIso.parse(candidate.expectedDeliveryDate)),
          expectedDeliveryDate: candidate.expectedDeliveryDate,
          openLineCount,
        },
      ];
    }),
  });
}
