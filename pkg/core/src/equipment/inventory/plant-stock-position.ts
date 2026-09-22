import type { Db } from '@pkg/db';
import { stockMovements } from '@pkg/db/equipment';
import type { UUID } from '@pkg/schema';
import { and, inArray, ne, sql } from 'drizzle-orm';

import { loadOpenOrderLines } from '../purchase-orders/purchase-order-service.js';
import { loadOpenCommitments, sumCommitmentsByPart } from './commitment-read.js';

/**
 * Free Stock and On Order for a named set of Parts. Both are plant-wide facts — every Job's
 * commitment eats the same shelf, and every open order feeds it — so they are read across the plant
 * and narrowed to the Parts asked for, never scoped to the calling Job.
 */
export async function loadPlantStockPosition({
  db,
  partIds,
}: {
  db: Db;
  partIds: readonly UUID[];
}): Promise<{ freeByPart: Map<string, number>; onOrderByPart: Map<string, number> }> {
  const [quantityRows, commitments, openOrderLines] = await Promise.all([
    db
      .select({
        partId: stockMovements.partId,
        quantity: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::double precision`,
      })
      .from(stockMovements)
      // A revaluation moves cost, never quantity, so it must not reach a stock-on-hand sum.
      .where(and(inArray(stockMovements.partId, [...partIds]), ne(stockMovements.movementType, 'revaluation')))
      .groupBy(stockMovements.partId),
    loadOpenCommitments(db, partIds).then(sumCommitmentsByPart),
    loadOpenOrderLines({ db, partIds }),
  ]);
  const onOrderByPart = new Map<string, number>();

  for (const line of openOrderLines) {
    onOrderByPart.set(line.partId, (onOrderByPart.get(line.partId) ?? 0) + line.outstandingQuantity);
  }

  const quantityByPart = new Map(quantityRows.map((row) => [row.partId, row.quantity]));

  return {
    freeByPart: new Map(
      partIds.map((partId) => [partId, (quantityByPart.get(partId) ?? 0) - (commitments.get(partId) ?? 0)]),
    ),
    onOrderByPart,
  };
}
