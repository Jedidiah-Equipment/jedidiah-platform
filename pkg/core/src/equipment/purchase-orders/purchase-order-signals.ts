import type { Db } from '@pkg/db';
import { purchaseOrders, supplier } from '@pkg/db/equipment';
import { diffDateOnlyDays, toPlantDateOnly } from '@pkg/domain';
import { DateOnlyIso } from '@pkg/schema';
import {
  type LatePurchaseOrderResult,
  LatePurchaseOrderResult as LatePurchaseOrderResultSchema,
} from '@pkg/schema/equipment';
import { and, asc, eq, isNotNull, isNull, lt } from 'drizzle-orm';

import { loadOpenOrderLines } from './purchase-order-service.js';

/**
 * Sent orders past the date they were promised for, with something still owed (spec §12).
 *
 * "Still owed" is the same open-line read the buy list's on-order figure comes from, so an order
 * cannot be late here while counting as cover there. A closed-short order is deliberately absent:
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
  const [candidates, openLines] = await Promise.all([
    db
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
      .orderBy(asc(purchaseOrders.expectedDeliveryDate), asc(purchaseOrders.code)),
    loadOpenOrderLines({ db }),
  ]);
  const openLineCounts = new Map<string, number>();

  for (const line of openLines) {
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
