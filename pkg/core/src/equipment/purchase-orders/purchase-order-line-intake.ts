import type { DatabaseTransaction, Db } from '@pkg/db';
import { purchaseOrderLineArrivals, purchaseOrderLines, stockMovements } from '@pkg/db/equipment';
import type { UUID } from '@pkg/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';

/**
 * The return reasons that leave the Supplier still owing the goods (spec §4). Sending back the
 * wrong item or a defective one re-opens the line's expectation, because a replacement is coming;
 * `order-error` is us admitting we asked for the wrong thing, and nothing is owed in its place.
 */
const REPLACEMENT_OWED_RETURN_REASONS = ['wrong-item', 'defective'] as const;

/**
 * What each line has taken in and kept, by line id. A line is present only once something has moved
 * against it, so `has` answers whether its history exists and `get` what it has kept — two different
 * questions: a fully returned line has kept nothing but still carries the rows that pin it in place.
 */
export type PurchaseOrderLineIntake = ReadonlyMap<string, number>;

/**
 * The one place that knows a Part Line's intake is read from the ledger and a Custom Line's from its
 * Arrivals. The derived `partially received` / `received` states, a line's outstanding quantity, the
 * plant's On Order figure and the late list are all read from this and never stored (§4).
 *
 * A Part Line keeps its receipts *less* the returns that owe a replacement: a line that took ten and
 * sent all ten back as defective is waiting on ten again, and every surface that asks what is still
 * coming has to say so — including the over-receipt warning, which would otherwise fire on the
 * replacement delivery.
 */
export async function loadLineIntake({
  db,
  purchaseOrderIds,
}: {
  db: Db | DatabaseTransaction;
  purchaseOrderIds: readonly UUID[];
}): Promise<PurchaseOrderLineIntake> {
  if (purchaseOrderIds.length === 0) return new Map();

  const ledger = db
    .select({
      // Return deltas are negative, so summing them alongside receipts nets the line down.
      kept: sql<number>`coalesce(sum(${stockMovements.delta}) filter (where ${stockMovements.movementType} = 'receipt' or (${stockMovements.movementType} = 'return-to-supplier' and ${inArray(stockMovements.reason, [...REPLACEMENT_OWED_RETURN_REASONS])})), 0)::double precision`,
      lineId: purchaseOrderLines.id,
    })
    .from(stockMovements)
    // The ledger reaches its line by the composite key its foreign key is declared on.
    .innerJoin(
      purchaseOrderLines,
      and(
        eq(purchaseOrderLines.purchaseOrderId, stockMovements.purchaseOrderId),
        eq(purchaseOrderLines.partId, stockMovements.partId),
      ),
    )
    .where(inArray(stockMovements.purchaseOrderId, [...purchaseOrderIds]))
    .groupBy(purchaseOrderLines.id);
  const arrivals = db
    .select({
      kept: sql<number>`sum(${purchaseOrderLineArrivals.quantity})::double precision`,
      lineId: purchaseOrderLineArrivals.lineId,
    })
    .from(purchaseOrderLineArrivals)
    .where(inArray(purchaseOrderLineArrivals.purchaseOrderId, [...purchaseOrderIds]))
    .groupBy(purchaseOrderLineArrivals.lineId);

  const rows = await unionAll(ledger, arrivals);

  // Floored: an over-return posts by design (`exceeds-received` warns, never blocks), and a line
  // that sent back more than it took in has taken in nothing — not a negative amount, which would
  // inflate its outstanding quantity and the plant's On Order past what was ordered.
  return new Map(rows.map((row) => [row.lineId, Math.max(0, row.kept)]));
}
