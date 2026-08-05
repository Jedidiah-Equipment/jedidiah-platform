import { type DatabaseTransaction, type Db, partBom, parts, stockBuilds, stockMovements } from '@pkg/db';
import { type BuildBomComponent, type BuildPostedLine, deriveBuild } from '@pkg/domain';
import type {
  AuthId,
  BuildPostResult,
  PartStockTrackingMode,
  PartUnitOfMeasure,
  PostBuildInput,
  UUID,
} from '@pkg/schema';
import { BuildPostResult as BuildPostResultSchema, unitClassFor } from '@pkg/schema';
import { asc, eq, inArray } from 'drizzle-orm';

import { PartNotBuiltError } from '../parts/part-bom-errors.js';
import { PartNotFoundError } from '../parts/part-errors.js';
import {
  BuildComponentNotFoundError,
  BuildLinearPartError,
  BuildPeriodicPartError,
  BuildSelfComponentError,
} from './build-errors.js';
import { bucketKey, loadBucketQuantities, loadMovingAverages, scaleUnitCost } from './ledger.js';
import { resolveMovementActor } from './movement-actor.js';
import { assertDeltaMatchesUnitClass, assertLengthMatchesUnitClass } from './unit-class-rules.js';

type BuildPart = {
  id: string;
  isInternallyFabricated: boolean;
  stockTrackingMode: PartStockTrackingMode;
  unitOfMeasure: PartUnitOfMeasure;
};

/**
 * Posts one build: N units of a Built Part came off the rack, consuming what the builder says
 * actually left it. One transaction, value-preserving (spec §6) — the value the consume rows take
 * out of stock is exactly what the single produce row puts back, divided across the units made.
 *
 * Builds never recurse. Components come from stock at their current moving average; if the rack is
 * short, stock goes negative with a warning rather than the build being refused, because the build
 * already happened. Periodic components post nothing at all — their BOM lines are informational,
 * and their consumption is corrected by the next stocktake instead.
 *
 * The shape is deliberately flat: lock every Part at once, read the ledger twice, decide the whole
 * build in one pure call, write two statements. A ten-component BOM costs the same round trips as a
 * one-component BOM, and nothing about the outcome depends on the order the lines arrived in.
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
    const partsById = await lockBuildParts(tx, input);
    const movementActorUserId = await resolveMovementActor({
      assertedActorUserId: input.actorUserId,
      db: tx,
      sessionUserId: actorUserId,
    });
    const builtPart = partsById.get(input.builtPartId);
    if (!builtPart) throw new PartNotFoundError(input.builtPartId);

    assertBuildable(builtPart);
    assertDeltaMatchesUnitClass(input.quantity, unitClassFor(builtPart.unitOfMeasure));
    // Builds never recurse, so a Part can never consume itself (spec §6). The BOM table forbids the
    // stored row; this forbids the keyed line, which is the only other way one could arrive.
    if (input.consumption.some((line) => line.componentPartId === input.builtPartId)) {
      throw new BuildSelfComponentError(input.builtPartId);
    }

    const componentPartIds = input.consumption.map((line) => line.componentPartId);
    const [bom, averagesByPart, quantitiesByBucket] = await Promise.all([
      loadBom(tx, input.builtPartId),
      loadMovingAverages(tx, componentPartIds),
      loadBucketQuantities(tx, componentPartIds),
    ]);

    const posted = input.consumption.map((line): BuildPostedLine => {
      const component = partsById.get(line.componentPartId);
      if (!component) throw new BuildComponentNotFoundError(line.componentPartId);
      const unitClass = unitClassFor(component.unitOfMeasure);
      assertDeltaMatchesUnitClass(line.quantity, unitClass);
      assertLengthMatchesUnitClass(line.lengthMm, unitClass);

      return {
        componentPartId: line.componentPartId,
        // Raw material posts no consumption at all (spec §6); its line is a note to the builder.
        isInformational: component.stockTrackingMode === 'periodic',
        lengthMm: line.lengthMm,
        quantity: line.quantity,
        quantityOnHand: quantitiesByBucket.get(bucketKey(line.componentPartId, line.lengthMm)) ?? 0,
        unitCost: scaleUnitCost(averagesByPart.get(line.componentPartId) ?? null, line.lengthMm),
      };
    });

    const { consumption, producedUnitCost, warnings } = deriveBuild({ bom, posted, quantity: input.quantity });

    const [build] = await tx
      .insert(stockBuilds)
      .values({ actorUserId: movementActorUserId, builtPartId: input.builtPartId, quantity: input.quantity })
      .returning();
    if (!build) throw new Error('Stock build insert did not return a row');

    await tx.insert(stockMovements).values([
      ...consumption.map((line) => ({
        actorUserId: movementActorUserId,
        buildId: build.id,
        delta: -line.quantity,
        lengthMm: line.lengthMm,
        movementType: 'build-consume' as const,
        partId: line.componentPartId,
        // Already the per-piece cost — `scaleUnitCost` multiplied a linear component's average by
        // its length — so the row's value is quantity × unitCost. Scaling again would double it.
        unitCost: line.unitCost,
      })),
      {
        actorUserId: movementActorUserId,
        buildId: build.id,
        delta: input.quantity,
        movementType: 'build-produce' as const,
        partId: input.builtPartId,
        unitCost: producedUnitCost,
      },
    ]);

    return BuildPostResultSchema.parse({ build, producedUnitCost, warnings });
  });
}

function assertBuildable(part: BuildPart): void {
  if (!part.isInternallyFabricated) throw new PartNotBuiltError(part.id);
  if (part.stockTrackingMode === 'periodic') throw new BuildPeriodicPartError(part.id);
  if (unitClassFor(part.unitOfMeasure) === 'linear') throw new BuildLinearPartError(part.id);
}

/**
 * Locks the Built Part and every component in one ordered pass. Ordering matters: two builds sharing
 * components — or a pair where one's Built Part is the other's component — would otherwise take the
 * same rows in opposite orders and deadlock. Sorting by id gives every writer the same sequence.
 */
async function lockBuildParts(tx: DatabaseTransaction, input: PostBuildInput): Promise<Map<string, BuildPart>> {
  const partIds = [...new Set([input.builtPartId, ...input.consumption.map((line) => line.componentPartId)])].sort();
  const rows = await tx
    .select({
      id: parts.id,
      isInternallyFabricated: parts.isInternallyFabricated,
      stockTrackingMode: parts.stockTrackingMode,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(parts)
    .where(inArray(parts.id, partIds))
    .orderBy(asc(parts.id))
    .for('update');

  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * The stored BOM, which the posted consumption is compared against for deviation. Raw material is
 * carried as informational: its line posts nothing, so leaving it off is not a deviation.
 */
async function loadBom(tx: DatabaseTransaction, builtPartId: UUID): Promise<BuildBomComponent[]> {
  const rows = await tx
    .select({
      componentPartId: partBom.componentPartId,
      quantity: partBom.quantity,
      stockTrackingMode: parts.stockTrackingMode,
    })
    .from(partBom)
    .innerJoin(parts, eq(parts.id, partBom.componentPartId))
    .where(eq(partBom.parentPartId, builtPartId));

  return rows.map((row) => ({
    componentPartId: row.componentPartId,
    isInformational: row.stockTrackingMode === 'periodic',
    quantity: row.quantity,
  }));
}
