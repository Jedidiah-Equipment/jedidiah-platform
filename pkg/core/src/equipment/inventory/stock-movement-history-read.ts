import { type Db, user } from '@pkg/db';
import { jobs, parts, purchaseOrders, quotes, stockMovements, stocktakeSessions } from '@pkg/db/equipment';
import { deriveMovingAverageTimeline, valueStockMovement } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import type { StockMovementHistoryResult } from '@pkg/schema/equipment';
import { StockMovementHistoryResult as StockMovementHistoryResultSchema } from '@pkg/schema/equipment';
import { asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { StockMovementPartNotFoundError } from './stock-movement-errors.js';

/** One Part's whole ledger, each row named by what it points back at and valued at the average it moved. */
export async function getStockMovementHistory({
  db,
  partId,
}: {
  db: Db;
  partId: UUID;
}): Promise<StockMovementHistoryResult> {
  const part = await loadStockPartDetails({ db, partId });
  const recipient = alias(user, 'recipient');
  const sourceCheckout = alias(stockMovements, 'source_checkout');
  const rows = await db
    .select({
      actorName: user.name,
      actorUserId: stockMovements.actorUserId,
      buildId: stockMovements.buildId,
      createdAt: stockMovements.createdAt,
      delta: stockMovements.delta,
      id: stockMovements.id,
      jobCode: jobs.code,
      jobId: stockMovements.jobId,
      lengthMm: stockMovements.lengthMm,
      movementType: stockMovements.movementType,
      note: stockMovements.note,
      partId: stockMovements.partId,
      purchaseOrderId: stockMovements.purchaseOrderId,
      purchaseOrderCode: purchaseOrders.code,
      quoteCode: quotes.code,
      quoteId: stockMovements.quoteId,
      recipientName: recipient.name,
      recipientUserId: stockMovements.recipientUserId,
      reason: stockMovements.reason,
      runningBalance: sql<number>`(sum(${stockMovements.delta}) over (order by ${stockMovements.createdAt}, ${stockMovements.id}))::double precision`,
      stocktakeSessionId: stockMovements.stocktakeSessionId,
      stocktakeSessionScope: stocktakeSessions.scope,
      sourceCheckoutCreatedAt: sourceCheckout.createdAt,
      sourceCheckoutId: stockMovements.sourceCheckoutId,
      unitCost: stockMovements.unitCost,
    })
    .from(stockMovements)
    .innerJoin(user, eq(user.id, stockMovements.actorUserId))
    .leftJoin(purchaseOrders, eq(purchaseOrders.id, stockMovements.purchaseOrderId))
    .leftJoin(jobs, eq(jobs.id, stockMovements.jobId))
    .leftJoin(quotes, eq(quotes.id, stockMovements.quoteId))
    .leftJoin(stocktakeSessions, eq(stocktakeSessions.id, stockMovements.stocktakeSessionId))
    .leftJoin(recipient, eq(recipient.id, stockMovements.recipientUserId))
    .leftJoin(sourceCheckout, eq(sourceCheckout.id, stockMovements.sourceCheckoutId))
    .where(eq(stockMovements.partId, partId))
    .orderBy(asc(stockMovements.createdAt), asc(stockMovements.id));

  const movingAverageTimeline = deriveMovingAverageTimeline(rows);

  return StockMovementHistoryResultSchema.parse({
    items: rows.map((row, index) => ({
      ...row,
      movementValue:
        row.delta === 0
          ? null
          : valueStockMovement({
              averageUnitCost: movingAverageTimeline[index] ?? null,
              delta: row.delta,
              lengthMm: row.lengthMm,
              unitCost: row.unitCost,
            }),
    })),
    part,
  });
}

async function loadStockPartDetails({ db, partId }: { db: Db; partId: UUID }) {
  const [part] = await db
    .select({
      code: parts.code,
      id: parts.id,
      isInternallyFabricated: parts.isInternallyFabricated,
      name: parts.name,
      stockTrackingMode: parts.stockTrackingMode,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(parts)
    .where(eq(parts.id, partId));

  if (!part) {
    throw new StockMovementPartNotFoundError(partId);
  }

  return part;
}
