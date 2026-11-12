import type { Db } from '@pkg/db';
import { purchaseOrders, supplier } from '@pkg/db/equipment';
import {
  addDateOnlyDays,
  diffDateOnlyDays,
  JOHANNESBURG_TIME_ZONE,
  toPlantDateOnly,
  zonedDateStartToUtcInstant,
} from '@pkg/domain';
import { DateOnlyIso } from '@pkg/schema';
import {
  type LatePurchaseOrderResult,
  LatePurchaseOrderResult as LatePurchaseOrderResultSchema,
} from '@pkg/schema/equipment';
import { and, eq, isNull, lt, or } from 'drizzle-orm';

import { loadOpenLineCounts } from './purchase-order-service.js';

/** How long an order sent with no expected delivery date is given before it counts as late. */
export const UNDATED_PURCHASE_ORDER_DUE_DAYS = 30;

/**
 * Sent orders past the date they are due, with something still owed (spec §12). An order is due on
 * its expected delivery date or, when it was sent without one, {@link UNDATED_PURCHASE_ORDER_DUE_DAYS}
 * days after the plant day it was sent.
 *
 * "Still owed" is the same open-line read the buy list's on-order figure comes from, so an order
 * cannot be late here while counting as delivered there — widened only to the Custom Lines that are
 * never Part cover. A closed-short order is deliberately absent:
 * closing short is the assertion that the remainder is not coming, which is the answer this list
 * exists to prompt for.
 */
export async function listLatePurchaseOrders({
  clock = () => new Date(),
  db,
}: {
  clock?: () => Date;
  db: Db;
}): Promise<LatePurchaseOrderResult> {
  const today = toPlantDateOnly(clock());
  // Sent on or before this plant day, an undated order's due day is already behind today.
  const undatedSentBefore = zonedDateStartToUtcInstant(
    addDateOnlyDays(today, -UNDATED_PURCHASE_ORDER_DUE_DAYS),
    JOHANNESBURG_TIME_ZONE,
  );
  const candidates = await db
    .select({
      code: purchaseOrders.code,
      expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
      id: purchaseOrders.id,
      sentAt: purchaseOrders.sentAt,
      supplierName: supplier.companyName,
    })
    .from(purchaseOrders)
    .innerJoin(supplier, eq(supplier.id, purchaseOrders.supplierId))
    .where(
      and(
        eq(purchaseOrders.status, 'sent'),
        isNull(purchaseOrders.closedShortAt),
        or(
          lt(purchaseOrders.expectedDeliveryDate, today),
          and(isNull(purchaseOrders.expectedDeliveryDate), lt(purchaseOrders.sentAt, undatedSentBefore)),
        ),
      ),
    );
  const openLineCounts = await loadOpenLineCounts({
    db,
    purchaseOrderIds: candidates.map((candidate) => candidate.id),
  });

  const items = candidates.flatMap(({ sentAt, ...candidate }) => {
    const openLineCount = openLineCounts.get(candidate.id) ?? 0;
    // The status shape check guarantees a sent order carries its sentAt.
    if (openLineCount === 0 || sentAt === null) return [];
    const sentOn = toPlantDateOnly(sentAt);
    const dueDate =
      candidate.expectedDeliveryDate === null
        ? addDateOnlyDays(sentOn, UNDATED_PURCHASE_ORDER_DUE_DAYS)
        : DateOnlyIso.parse(candidate.expectedDeliveryDate);

    return [{ ...candidate, daysLate: diffDateOnlyDays(today, dueDate), openLineCount, sentOn }];
  });
  // Longest overdue first: the order that has kept a Job waiting the longest leads the list.
  items.sort((a, b) => b.daysLate - a.daysLate || a.code - b.code);

  return LatePurchaseOrderResultSchema.parse({ items });
}
