import { type DatabaseTransaction, type Db, parts, stockMovements } from '@pkg/db';
import { getZonedDateParts, JOHANNESBURG_TIME_ZONE, zonedDateStartToUtcInstant } from '@pkg/domain';
import type { InventoryKpis, StockAdjustmentReason as StockAdjustmentReasonType } from '@pkg/schema';
import { InventoryKpis as InventoryKpisSchema, StockAdjustmentReason } from '@pkg/schema';
import { subDays } from 'date-fns';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';

import { loadBucketQuantities, loadMovingAverages, scaleUnitCost } from './ledger.js';

const TOP_KPI_ITEM_LIMIT = 5;

export async function getInventoryKpis({
  db,
  throughAt = new Date(),
}: {
  db: Db;
  throughAt?: Date;
}): Promise<InventoryKpis> {
  return db.transaction((tx) => getInventoryKpisSnapshot(tx, throughAt), {
    accessMode: 'read only',
    isolationLevel: 'repeatable read',
  });
}

async function getInventoryKpisSnapshot(db: DatabaseTransaction, throughAt: Date): Promise<InventoryKpis> {
  const partRows = await db
    .select({ code: parts.code, id: parts.id, name: parts.name, stockTrackingMode: parts.stockTrackingMode })
    .from(parts);
  const partIds = partRows.map((part) => part.id);
  const [adjustmentRows, averages, quantities, consumptionRows] = await Promise.all([
    db
      .select({
        delta: stockMovements.delta,
        lengthMm: stockMovements.lengthMm,
        partId: stockMovements.partId,
        reason: stockMovements.reason,
      })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.movementType, 'adjustment'),
          gte(stockMovements.createdAt, getPlantMonthStart(throughAt)),
          lte(stockMovements.createdAt, throughAt),
        ),
      ),
    loadMovingAverages(db, partIds),
    loadBucketQuantities(db, partIds),
    db
      .select({ delta: stockMovements.delta, unitCost: stockMovements.unitCost })
      .from(stockMovements)
      .innerJoin(parts, eq(parts.id, stockMovements.partId))
      .where(
        and(
          eq(parts.stockTrackingMode, 'perpetual'),
          inArray(stockMovements.movementType, ['checkout', 'return-to-store', 'build-consume']),
          gte(stockMovements.createdAt, subDays(throughAt, 90)),
          lte(stockMovements.createdAt, throughAt),
        ),
      ),
  ]);
  const inventoryValue = calculateInventoryValue(
    partRows.map((part) => part.id),
    averages,
    quantities,
  );
  const perpetualInventoryValue = calculateInventoryValue(
    partRows.filter((part) => part.stockTrackingMode === 'perpetual').map((part) => part.id),
    averages,
    quantities,
  );
  const trailing90DayConsumptionValue = consumptionRows.reduce<number | null>((total, movement) => {
    if (total === null || movement.unitCost === null) return null;

    return total - movement.delta * movement.unitCost;
  }, 0);
  const inventoryTurns =
    trailing90DayConsumptionValue === null || perpetualInventoryValue === null || perpetualInventoryValue === 0
      ? null
      : (trailing90DayConsumptionValue * 4) / perpetualInventoryValue;
  const adjustmentValues = new Map<StockAdjustmentReasonType, number | null>();
  const scrapValues = new Map<string, number | null>();

  for (const adjustment of adjustmentRows) {
    const reason = StockAdjustmentReason.parse(adjustment.reason);
    const value = priceMagnitudeAtCurrentAverage(adjustment, averages.get(adjustment.partId) ?? null);
    adjustmentValues.set(reason, addNullable(adjustmentValues.get(reason) ?? 0, value));
    if (reason === 'scrap') {
      scrapValues.set(adjustment.partId, addNullable(scrapValues.get(adjustment.partId) ?? 0, value));
    }
  }
  const adjustments = [...adjustmentValues]
    .map(([reason, value]) => ({ reason, value }))
    .sort(compareValueDescending)
    .slice(0, TOP_KPI_ITEM_LIMIT);
  const partsById = new Map(partRows.map((part) => [part.id, part]));
  const scrapItems = [...scrapValues]
    .flatMap(([partId, value]) => {
      const part = partsById.get(partId);

      return part ? [{ partCode: part.code, partId, partName: part.name, value }] : [];
    })
    .sort(compareValueDescending)
    .slice(0, TOP_KPI_ITEM_LIMIT);

  return InventoryKpisSchema.parse({
    adjustments,
    inventoryTurns,
    inventoryValue,
    scrapItems,
    trailing90DayConsumptionValue,
  });
}

function getPlantMonthStart(throughAt: Date): Date {
  const { month, year } = getZonedDateParts(throughAt, JOHANNESBURG_TIME_ZONE);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;

  return zonedDateStartToUtcInstant(monthStart, JOHANNESBURG_TIME_ZONE);
}

function priceMagnitudeAtCurrentAverage(
  movement: { delta: number; lengthMm: number | null },
  averageUnitCost: number | null,
): number | null {
  if (movement.delta === 0) return 0;
  const unitCost = scaleUnitCost(averageUnitCost, movement.lengthMm);

  return unitCost === null ? null : Math.abs(movement.delta) * unitCost;
}

function addNullable(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left + right;
}

function compareValueDescending<T extends { value: number | null }>(left: T, right: T): number {
  if (left.value === null) return right.value === null ? 0 : 1;
  if (right.value === null) return -1;

  return right.value - left.value;
}

function calculateInventoryValue(
  partIds: readonly string[],
  averages: ReadonlyMap<string, number | null>,
  quantities: ReadonlyMap<string, ReadonlyMap<number | null, number>>,
): number | null {
  let value: number | null = 0;

  for (const partId of partIds) {
    const average = averages.get(partId) ?? null;

    for (const [lengthMm, quantity] of quantities.get(partId) ?? []) {
      if (quantity === 0) continue;
      const unitCost = scaleUnitCost(average, lengthMm);
      value = value === null || unitCost === null ? null : value + quantity * unitCost;
    }
  }

  return value;
}
