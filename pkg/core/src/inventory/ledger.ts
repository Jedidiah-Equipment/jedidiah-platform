import { type DatabaseTransaction, type Db, parts, stockMovements } from '@pkg/db';
import { deriveMovingAverage } from '@pkg/domain';
import type { StockMovement, UUID } from '@pkg/schema';
import { StockMovement as StockMovementSchema } from '@pkg/schema';
import { and, asc, eq, inArray, isNull, ne, type SQL, sql } from 'drizzle-orm';

import { FabricatedPartCostError, StockMovementPartNotFoundError } from './stock-movement-errors.js';

export type LedgerDb = Db | DatabaseTransaction;

/**
 * The ledger itself: the row every stock writer appends, the Part facts it is judged against, and
 * the replays that produce those facts. Adjustments, Job movements, receipts and builds all sit on
 * this module, which is what keeps a movement meaning the same thing whichever surface posted it.
 *
 * Every read takes a *set* of Parts. That is what keeps a multi-Part writer flat: a build touches
 * every component of its BOM and still asks the ledger exactly twice.
 */

export async function insertMovement(
  db: DatabaseTransaction,
  values: typeof stockMovements.$inferInsert,
): Promise<StockMovement> {
  const [movement] = await db.insert(stockMovements).values(values).returning();
  if (!movement) throw new Error('Stock movement insert did not return a row');

  return StockMovementSchema.parse(movement);
}

/** The Part facts every ledger write is judged against, optionally under the writer's row lock. */
export async function loadStockPart({
  db,
  lockForMovement = false,
  partId,
}: {
  db: LedgerDb;
  lockForMovement?: boolean;
  partId: UUID;
}) {
  const query = db
    .select({
      id: parts.id,
      isInternallyFabricated: parts.isInternallyFabricated,
      standardPurchaseLengthMm: parts.standardPurchaseLengthMm,
      stockTrackingMode: parts.stockTrackingMode,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(parts)
    .where(eq(parts.id, partId))
    .limit(1);
  // Every writer takes the same Part lock so cost replay and the appended stamp form one ledger order.
  const [part] = lockForMovement ? await query.for('update') : await query;
  if (!part) throw new StockMovementPartNotFoundError(partId);

  return part;
}

/** The ledger stores three decimals, so a computed quantity is rounded to what the column can hold. */
export function toLedgerQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** A length bucket's identity. Discrete and measured Parts hold exactly one `null` bucket. */
export function bucketKey(partId: string, lengthMm: number | null): string {
  return `${partId}:${lengthMm ?? ''}`;
}

/** Scales a Part's average to one piece: linear stock is costed by the millimetre it is cut from. */
export function scaleUnitCost(averageUnitCost: number | null, lengthMm: number | null): number | null {
  if (averageUnitCost === null) return null;

  return lengthMm === null ? averageUnitCost : averageUnitCost * lengthMm;
}

/**
 * Each Part's current moving average, replayed in ledger order. Null where the Part's ledger holds
 * no costed row yet, which reads as "no cost yet" rather than R0.00 (spec §5). A Part with no
 * movements at all is absent from the map, which `?? null` and the null value both mean the same by.
 */
export async function loadMovingAverages(db: LedgerDb, partIds: readonly UUID[]): Promise<Map<string, number | null>> {
  if (partIds.length === 0) return new Map();

  const rows = await db
    .select({
      delta: stockMovements.delta,
      lengthMm: stockMovements.lengthMm,
      movementType: stockMovements.movementType,
      partId: stockMovements.partId,
      reason: stockMovements.reason,
      unitCost: stockMovements.unitCost,
    })
    .from(stockMovements)
    .where(inArray(stockMovements.partId, [...partIds]))
    .orderBy(asc(stockMovements.partId), asc(stockMovements.createdAt), asc(stockMovements.id));

  const byPart = new Map<string, Array<(typeof rows)[number]>>();
  for (const row of rows) {
    const movements = byPart.get(row.partId);
    if (movements) movements.push(row);
    else byPart.set(row.partId, [row]);
  }

  return new Map([...byPart].map(([partId, movements]) => [partId, deriveMovingAverage(movements)]));
}

/**
 * Stock on hand per Part, and within each Part per length bucket — the `null` bucket being the only
 * one a discrete or measured Part holds. Nested rather than flattened onto a composite key so a
 * caller asking about one Part's buckets gets them as lengths, with nothing to decode back out. A
 * revaluation moves cost and never quantity, so it must not open a bucket of its own.
 */
export async function loadBucketQuantities(
  db: LedgerDb,
  partIds: readonly UUID[],
): Promise<Map<string, Map<number | null, number>>> {
  if (partIds.length === 0) return new Map();

  const rows = await db
    .select({
      lengthMm: stockMovements.lengthMm,
      partId: stockMovements.partId,
      quantity: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::double precision`,
    })
    .from(stockMovements)
    .where(and(inArray(stockMovements.partId, [...partIds]), ne(stockMovements.movementType, 'revaluation')))
    .groupBy(stockMovements.partId, stockMovements.lengthMm);

  const quantities = new Map<string, Map<number | null, number>>();

  for (const row of rows) {
    const buckets = quantities.get(row.partId);
    if (buckets) buckets.set(row.lengthMm, row.quantity);
    else quantities.set(row.partId, new Map([[row.lengthMm, row.quantity]]));
  }

  return quantities;
}

/** Matches one length bucket, or the single `null` bucket a non-linear Part holds. */
export function bucketMatches(lengthMm: number | null): SQL {
  return lengthMm === null ? isNull(stockMovements.lengthMm) : eq(stockMovements.lengthMm, lengthMm);
}

/** The net delta of whatever slice of the ledger the condition selects. */
export async function sumDelta(db: LedgerDb, where: SQL | undefined): Promise<number> {
  return scalar(
    db
      .select({ value: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::double precision` })
      .from(stockMovements)
      .where(where),
  );
}

/**
 * A one-row, one-column aggregate. Every `coalesce(sum(…), 0)` read here and in the services that
 * sit on this module unwraps the same way; an empty result is zero, not absent.
 */
export async function scalar(query: PromiseLike<Array<{ value: number }>>): Promise<number> {
  const [row] = await query;

  return row?.value ?? 0;
}

/**
 * A Built Part's cost is *derived*, never keyed. Its only costed row is the `build-produce` the
 * build itself writes, which divides the value the consume rows took out across the units made — so
 * the two facts hold together: a build may stamp any cost it derived, and no hand-entered figure
 * may reach the same Part through an adjustment or a revaluation.
 *
 * Correcting a wrong built-part average therefore means correcting the build, not overwriting the
 * number. That is deliberate: overwriting would assert a price for something we never bought, and
 * for sheet metal cut from plate it would pay for the plate twice (spec §5).
 *
 * This judges the *cost keyed onto an adjustment*, which is why a zero passes: adjusting a Built
 * Part's quantity is ordinary, and a zero asserts no price. Whether the Part may be revalued at all
 * is the Part's own question, answered by `derivePartStockActions(...).revalue`.
 */
export function assertBuiltPartCostIsDerived(isInternallyFabricated: boolean, unitCost: number | null): void {
  if (isInternallyFabricated && unitCost !== null && unitCost !== 0) {
    throw new FabricatedPartCostError();
  }
}
