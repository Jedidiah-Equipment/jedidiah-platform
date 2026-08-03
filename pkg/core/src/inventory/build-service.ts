import { type DatabaseTransaction, type Db, partBom, parts, stockBuilds, stockMovements } from '@pkg/db';
import { deriveBuildProducedUnitCost, deriveBuildWarnings, deriveMovingAverage } from '@pkg/domain';
import type { AuthId, BuildPostResult, PostBuildInput, StockMovementWarningCode, UUID } from '@pkg/schema';
import { BuildPostResult as BuildPostResultSchema, unitClassFor } from '@pkg/schema';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';

import { PartNotBuiltError } from '../parts/part-bom-errors.js';
import { PartNotFoundError } from '../parts/part-errors.js';
import {
  BuildComponentNotFoundError,
  BuildLinearPartError,
  BuildPeriodicPartError,
  BuildSelfComponentError,
} from './build-errors.js';
import { StockMovementDeltaError, StockMovementLengthError } from './stock-movement-errors.js';

/**
 * Posts one build: N units of a Built Part came off the rack, consuming what the builder says
 * actually left it. One transaction, value-preserving (spec §6) — the value the consume rows take
 * out of stock is exactly what the single produce row puts back, divided across the units made.
 *
 * Builds never recurse. Components come from stock at their current moving average; if the rack is
 * short, stock goes negative with a warning rather than the build being refused, because the build
 * already happened. Periodic components post nothing at all — their BOM lines are informational,
 * and their consumption is corrected by the next stocktake instead.
 */
export async function postBuild({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PostBuildInput;
}): Promise<BuildPostResult> {
  return db.transaction(async (tx) => {
    const builtPart = await lockBuildPart(tx, input.builtPartId);
    if (!builtPart.isInternallyFabricated) throw new PartNotBuiltError(input.builtPartId);
    if (builtPart.stockTrackingMode === 'periodic') throw new BuildPeriodicPartError(input.builtPartId);
    if (unitClassFor(builtPart.unitOfMeasure) === 'linear') throw new BuildLinearPartError(input.builtPartId);
    assertQuantityMatchesUnitClass(input.quantity, builtPart.unitOfMeasure);

    const components = await loadBuildComponents(tx, input);
    const expectedByComponent = await loadExpectedConsumption(tx, input);

    const [build] = await tx
      .insert(stockBuilds)
      .values({ actorUserId, builtPartId: input.builtPartId, quantity: input.quantity })
      .returning();
    if (!build) throw new Error('Stock build insert did not return a row');

    const consumed: Array<{ quantity: number; unitCost: number | null }> = [];
    const warnings: Array<{ codes: StockMovementWarningCode[]; componentPartId: UUID }> = [];

    for (const line of input.consumption) {
      const component = components.get(line.componentPartId);
      if (!component) throw new BuildComponentNotFoundError(line.componentPartId);
      if (component.id === input.builtPartId) throw new BuildSelfComponentError(input.builtPartId);
      assertQuantityMatchesUnitClass(line.quantity, component.unitOfMeasure);
      assertLengthMatchesUnitClass(line.lengthMm, component.unitOfMeasure);

      // Raw material posts no consumption at all (spec §6); its BOM line is a note to the builder.
      if (component.stockTrackingMode === 'periodic') continue;

      const [unitCost, quantityOnHand] = await Promise.all([
        deriveComponentUnitCost(tx, line.componentPartId, line.lengthMm),
        sumBucketOnHand(tx, line.componentPartId, line.lengthMm),
      ]);
      const codes = deriveBuildWarnings({
        expectedQuantity: (expectedByComponent.get(line.componentPartId) ?? 0) * input.quantity,
        quantity: line.quantity,
        quantityOnHand,
      });
      if (codes.length > 0) warnings.push({ codes, componentPartId: line.componentPartId });

      await tx.insert(stockMovements).values({
        actorUserId,
        buildId: build.id,
        delta: -line.quantity,
        lengthMm: line.lengthMm,
        movementType: 'build-consume',
        partId: line.componentPartId,
        unitCost,
      });
      consumed.push({ quantity: line.quantity * (line.lengthMm ?? 1), unitCost });
    }

    const producedUnitCost = deriveBuildProducedUnitCost({ consumed, quantity: input.quantity });

    await tx.insert(stockMovements).values({
      actorUserId,
      buildId: build.id,
      delta: input.quantity,
      movementType: 'build-produce',
      partId: input.builtPartId,
      unitCost: producedUnitCost,
    });

    return BuildPostResultSchema.parse({ build, producedUnitCost, warnings });
  });
}

async function lockBuildPart(tx: DatabaseTransaction, partId: UUID) {
  const [part] = await tx
    .select({
      id: parts.id,
      isInternallyFabricated: parts.isInternallyFabricated,
      stockTrackingMode: parts.stockTrackingMode,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(parts)
    .where(eq(parts.id, partId))
    .for('update');
  if (!part) throw new PartNotFoundError(partId);

  return part;
}

async function loadBuildComponents(tx: DatabaseTransaction, input: PostBuildInput) {
  const componentPartIds = input.consumption.map((line) => line.componentPartId);
  if (componentPartIds.length === 0) return new Map<string, never>();

  const rows = await tx
    .select({
      id: parts.id,
      stockTrackingMode: parts.stockTrackingMode,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(parts)
    .where(inArray(parts.id, componentPartIds))
    // The same lock a movement takes, so two builds cannot interleave on one component's average.
    .for('update');

  return new Map(rows.map((row) => [row.id, row]));
}

/** The BOM quantity per unit, which the posted consumption is compared against for deviation. */
async function loadExpectedConsumption(tx: DatabaseTransaction, input: PostBuildInput): Promise<Map<string, number>> {
  const rows = await tx
    .select({ componentPartId: partBom.componentPartId, quantity: partBom.quantity })
    .from(partBom)
    .where(eq(partBom.parentPartId, input.builtPartId));

  return new Map(rows.map((row) => [row.componentPartId, row.quantity]));
}

/** A component is consumed at its current average, scaled to the piece length for linear stock. */
async function deriveComponentUnitCost(
  tx: DatabaseTransaction,
  partId: UUID,
  lengthMm: number | null,
): Promise<number | null> {
  const orderedMovements = await tx
    .select({
      delta: stockMovements.delta,
      lengthMm: stockMovements.lengthMm,
      movementType: stockMovements.movementType,
      reason: stockMovements.reason,
      unitCost: stockMovements.unitCost,
    })
    .from(stockMovements)
    .where(eq(stockMovements.partId, partId))
    .orderBy(asc(stockMovements.createdAt), asc(stockMovements.id));
  const movingAverage = deriveMovingAverage(orderedMovements);

  if (movingAverage === null) return null;

  return lengthMm === null ? movingAverage : movingAverage * lengthMm;
}

async function sumBucketOnHand(tx: DatabaseTransaction, partId: UUID, lengthMm: number | null): Promise<number> {
  const [row] = await tx
    .select({ quantity: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::double precision` })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.partId, partId),
        // A revaluation moves cost, never quantity, so it never belongs to a length bucket.
        ne(stockMovements.movementType, 'revaluation'),
        lengthMm === null ? sql`${stockMovements.lengthMm} IS NULL` : eq(stockMovements.lengthMm, lengthMm),
      ),
    );

  return row?.quantity ?? 0;
}

function assertQuantityMatchesUnitClass(quantity: number, unitOfMeasure: Parameters<typeof unitClassFor>[0]): void {
  const unitClass = unitClassFor(unitOfMeasure);
  if (unitClass !== 'measured' && !Number.isInteger(quantity)) throw new StockMovementDeltaError(unitClass);
}

function assertLengthMatchesUnitClass(
  lengthMm: number | null,
  unitOfMeasure: Parameters<typeof unitClassFor>[0],
): void {
  const unitClass = unitClassFor(unitOfMeasure);
  if (unitClass === 'linear' && lengthMm === null) throw new StockMovementLengthError(true);
  if (unitClass !== 'linear' && lengthMm !== null) throw new StockMovementLengthError(false);
}
