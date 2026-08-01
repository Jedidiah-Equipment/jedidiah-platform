import { type Db, parts, stockMovements, user } from '@pkg/db';
import { deriveMovingAverage, deriveMovingAverageTimeline, valueStockBucket, valueStockMovement } from '@pkg/domain';
import type {
  AuthId,
  PartUnitClass,
  PostAdjustmentInput,
  PostRevaluationInput,
  StockMovement,
  StockMovementHistoryResult,
  StockOnHandResult,
  UUID,
} from '@pkg/schema';
import {
  StockMovementHistoryResult as StockMovementHistoryResultSchema,
  StockMovement as StockMovementSchema,
  StockOnHandResult as StockOnHandResultSchema,
  unitClassFor,
} from '@pkg/schema';
import { asc, eq, sql } from 'drizzle-orm';

import {
  FabricatedPartCostError,
  PeriodicStockAdjustmentError,
  StockMovementDeltaError,
  StockMovementLengthError,
  StockMovementPartNotFoundError,
} from './stock-movement-errors.js';

export async function postAdjustment({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PostAdjustmentInput;
}): Promise<StockMovement> {
  const part = await loadStockPart({ db, partId: input.partId });
  const unitClass = unitClassFor(part.unitOfMeasure);

  assertDeltaMatchesUnitClass(input.delta, unitClass);
  assertLengthMatchesUnitClass(input.lengthMm, unitClass);
  assertFabricatedPartCost(part.isInternallyFabricated, input.unitCost);

  // Go-live opening balances are the one pre-count seed for periodic stock; normal periodic writes stay count-only.
  if (part.stockTrackingMode === 'periodic' && input.reason !== 'opening-balance' && input.reason !== 'stock-count') {
    throw new PeriodicStockAdjustmentError(input.reason);
  }

  const [movement] = await db
    .insert(stockMovements)
    .values({
      actorUserId,
      delta: input.delta,
      lengthMm: input.lengthMm,
      movementType: 'adjustment',
      note: input.note,
      partId: input.partId,
      reason: input.reason,
      unitCost: input.unitCost,
    })
    .returning();

  if (!movement) {
    throw new Error('Stock movement insert did not return a row');
  }

  return StockMovementSchema.parse(movement);
}

export async function postRevaluation({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PostRevaluationInput;
}): Promise<StockMovement> {
  const part = await loadStockPart({ db, partId: input.partId });

  if (input.lengthMm !== null) {
    throw new StockMovementLengthError(false);
  }

  assertFabricatedPartCost(part.isInternallyFabricated, input.unitCost);

  const [movement] = await db
    .insert(stockMovements)
    .values({
      actorUserId,
      delta: 0,
      lengthMm: null,
      movementType: 'revaluation',
      note: input.note,
      partId: input.partId,
      reason: null,
      unitCost: input.unitCost,
    })
    .returning();

  if (!movement) {
    throw new Error('Stock movement insert did not return a row');
  }

  return StockMovementSchema.parse(movement);
}

export async function listStockOnHand({ db }: { db: Db }): Promise<StockOnHandResult> {
  const [quantityRows, movementRows] = await Promise.all([
    db
      .select({
        asOfLastCount:
          sql<Date | null>`max(${stockMovements.createdAt}) filter (where ${stockMovements.reason} = 'stock-count')`.mapWith(
            stockMovements.createdAt,
          ),
        lengthMm: stockMovements.lengthMm,
        isInternallyFabricated: parts.isInternallyFabricated,
        partCode: parts.code,
        partId: parts.id,
        partName: parts.name,
        quantity: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::double precision`,
        stockTrackingMode: parts.stockTrackingMode,
        unitOfMeasure: parts.unitOfMeasure,
      })
      .from(parts)
      .leftJoin(stockMovements, eq(stockMovements.partId, parts.id))
      .groupBy(parts.id, parts.code, parts.name, parts.stockTrackingMode, parts.unitOfMeasure, stockMovements.lengthMm)
      .orderBy(asc(parts.code), asc(stockMovements.lengthMm)),
    db
      .select({
        delta: stockMovements.delta,
        lengthMm: stockMovements.lengthMm,
        movementType: stockMovements.movementType,
        partId: stockMovements.partId,
        reason: stockMovements.reason,
        unitCost: stockMovements.unitCost,
      })
      .from(stockMovements)
      .orderBy(asc(stockMovements.partId), asc(stockMovements.createdAt), asc(stockMovements.id)),
  ]);

  const movementsByPart = new Map<UUID, typeof movementRows>();
  for (const movement of movementRows) {
    const partMovements = movementsByPart.get(movement.partId) ?? [];
    partMovements.push(movement);
    movementsByPart.set(movement.partId, partMovements);
  }

  return StockOnHandResultSchema.parse({
    items: quantityRows.map((row) => {
      const averageUnitCost = row.isInternallyFabricated
        ? 0
        : deriveMovingAverage(movementsByPart.get(row.partId) ?? []);

      return {
        averageUnitCost,
        asOfLastCount: row.stockTrackingMode === 'periodic' ? row.asOfLastCount : null,
        lengthMm: row.lengthMm,
        partCode: row.partCode,
        partId: row.partId,
        partName: row.partName,
        quantity: row.quantity,
        stockTrackingMode: row.stockTrackingMode,
        totalValue: valueStockBucket({ averageUnitCost, lengthMm: row.lengthMm, quantity: row.quantity }),
        unitOfMeasure: row.unitOfMeasure,
      };
    }),
  });
}

export async function getStockMovementHistory({
  db,
  partId,
}: {
  db: Db;
  partId: UUID;
}): Promise<StockMovementHistoryResult> {
  const part = await loadStockPartDetails({ db, partId });
  const rows = await db
    .select({
      actorName: user.name,
      actorUserId: stockMovements.actorUserId,
      createdAt: stockMovements.createdAt,
      delta: stockMovements.delta,
      id: stockMovements.id,
      lengthMm: stockMovements.lengthMm,
      movementType: stockMovements.movementType,
      note: stockMovements.note,
      partId: stockMovements.partId,
      reason: stockMovements.reason,
      runningBalance: sql<number>`(sum(${stockMovements.delta}) over (order by ${stockMovements.createdAt}, ${stockMovements.id}))::double precision`,
      unitCost: stockMovements.unitCost,
    })
    .from(stockMovements)
    .innerJoin(user, eq(user.id, stockMovements.actorUserId))
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
              averageUnitCost: part.isInternallyFabricated ? 0 : (movingAverageTimeline[index] ?? null),
              delta: row.delta,
              lengthMm: row.lengthMm,
              unitCost: row.unitCost,
            }),
    })),
    part,
  });
}

async function loadStockPart({ db, partId }: { db: Db; partId: UUID }) {
  const part = await db.query.parts.findFirst({
    columns: { id: true, isInternallyFabricated: true, stockTrackingMode: true, unitOfMeasure: true },
    where: eq(parts.id, partId),
  });

  if (!part) {
    throw new StockMovementPartNotFoundError(partId);
  }

  return part;
}

async function loadStockPartDetails({ db, partId }: { db: Db; partId: UUID }) {
  const [part] = await db
    .select({
      code: parts.code,
      id: parts.id,
      isInternallyFabricated: parts.isInternallyFabricated,
      name: parts.name,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(parts)
    .where(eq(parts.id, partId));

  if (!part) {
    throw new StockMovementPartNotFoundError(partId);
  }

  return part;
}

function assertDeltaMatchesUnitClass(delta: number, unitClass: PartUnitClass): void {
  if (unitClass !== 'measured' && !Number.isInteger(delta)) {
    throw new StockMovementDeltaError(unitClass);
  }
}

function assertLengthMatchesUnitClass(lengthMm: number | null, unitClass: PartUnitClass): void {
  if (unitClass === 'linear' && lengthMm === null) {
    throw new StockMovementLengthError(true);
  }

  if (unitClass !== 'linear' && lengthMm !== null) {
    throw new StockMovementLengthError(false);
  }
}

function assertFabricatedPartCost(isInternallyFabricated: boolean, unitCost: number | null): void {
  if (isInternallyFabricated && unitCost !== null && unitCost !== 0) {
    throw new FabricatedPartCostError();
  }
}
