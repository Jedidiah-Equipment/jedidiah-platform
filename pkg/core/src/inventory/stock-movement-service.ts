import {
  type DatabaseTransaction,
  type Db,
  jobCfoAssemblies,
  jobCfoParts,
  jobs,
  parts,
  purchaseOrders,
  stockMovements,
  stocktakeSessions,
  supplier,
  user,
} from '@pkg/db';
import {
  deriveCommitment,
  deriveMovingAverage,
  deriveMovingAverageTimeline,
  deriveOutstandingDrawUnitCost,
  deriveStockMovementWarnings,
  type StockMovementContext,
  valueStockBucket,
  valueStockMovement,
} from '@pkg/domain';
import type {
  AuthId,
  JobStockMovementType,
  JobStockResult,
  PostAdjustmentInput,
  PostJobMovementInput,
  PostRevaluationInput,
  StockMovement,
  StockMovementHistoryResult,
  StockMovementPostResult,
  StockOnHandResult,
  StockOnHandRow,
  UUID,
} from '@pkg/schema';
import {
  isPeriodicStockAdjustmentReason,
  JOB_STOCK_MOVEMENT_TYPES,
  JobStockResult as JobStockResultSchema,
  StockMovementHistoryResult as StockMovementHistoryResultSchema,
  StockMovementPostResult as StockMovementPostResultSchema,
  StockOnHandResult as StockOnHandResultSchema,
  unitClassFor,
} from '@pkg/schema';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { lockJob, lockMutableJob } from '../jobs/job-mutation-guards.js';
import { loadOpenOrderLines } from '../purchase-orders/purchase-order-service.js';
import { JobClosedOutError } from './close-out-errors.js';
import { getJobCloseOutAt } from './close-out-service.js';

import { loadOpenCommitments, sumCommitmentsByPart } from './commitment-read.js';
import { loadCfoQuantitiesByPart, loadJobStockJob } from './job-stock-facts.js';
import {
  assertBuiltPartCostIsDerived,
  bucketMatches,
  insertMovement,
  loadMovingAverages,
  loadStockPart,
  scalar,
  scaleUnitCost,
  sumDelta,
} from './ledger.js';
import { resolveMovementActor } from './movement-actor.js';
import { groupBy, sumBy } from './row-grouping.js';
import {
  PeriodicStockMovementError,
  ScannedPartNotFoundError,
  StockMovementPartNotFoundError,
} from './stock-movement-errors.js';
import { assertDeltaMatchesUnitClass, assertLengthMatchesUnitClass } from './unit-class-rules.js';

export async function postAdjustment({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PostAdjustmentInput;
}): Promise<StockMovement> {
  return db.transaction(async (tx) => {
    const part = await loadStockPart({ db: tx, lockForMovement: true, partId: input.partId });
    const movementActorUserId = await resolveMovementActor({
      assertedActorUserId: input.actorUserId,
      db: tx,
      sessionUserId: actorUserId,
    });
    const unitClass = unitClassFor(part.unitOfMeasure);

    assertDeltaMatchesUnitClass(input.delta, unitClass);
    assertLengthMatchesUnitClass(input.lengthMm, unitClass);
    assertBuiltPartCostIsDerived(part.isInternallyFabricated, input.unitCost);
    if (part.stockTrackingMode === 'periodic' && !isPeriodicStockAdjustmentReason(input.reason)) {
      throw new PeriodicStockMovementError(input.reason);
    }

    return insertMovement(tx, {
      actorUserId: movementActorUserId,
      delta: input.delta,
      lengthMm: input.lengthMm,
      movementType: 'adjustment',
      note: input.note,
      partId: input.partId,
      reason: input.reason,
      unitCost: input.unitCost,
    });
  });
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
  return db.transaction(async (tx) => {
    const part = await loadStockPart({ db: tx, lockForMovement: true, partId: input.partId });

    assertBuiltPartCostIsDerived(part.isInternallyFabricated, input.unitCost);

    return insertMovement(tx, {
      actorUserId,
      delta: 0,
      movementType: 'revaluation',
      note: input.note,
      partId: input.partId,
      unitCost: input.unitCost,
    });
  });
}

/**
 * Draws a Part against a Job, or returns it. The two directions share every rule but three: a return
 * is still valid on a cancelled Job (physically recovered stock must not be stranded off-ledger), it
 * reverses at the cost the parts left with rather than today's average, and its delta is positive.
 *
 * `actorUserId` is who is signed in; `input.actorUserId` is who the shared tablet says is standing
 * at it, and the row is stamped with the second when it is given (see `resolveMovementActor`).
 */
export async function postJobMovement({
  actorUserId,
  db,
  input,
  movementType,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PostJobMovementInput;
  movementType: JobStockMovementType;
}): Promise<StockMovementPostResult> {
  return db.transaction(async (tx) => {
    const part = await loadStockPart({ db: tx, lockForMovement: true, partId: input.partId });
    const movementActorUserId = await resolveMovementActor({
      assertedActorUserId: input.actorUserId,
      db: tx,
      sessionUserId: actorUserId,
    });
    await (movementType === 'checkout' ? lockMutableJob(tx, input.jobId) : lockJob(tx, input.jobId));
    // Close-out ended this Job's stock life; a later draw would sit against it unprompted forever,
    // since a closed Job can never re-enter the queue. Returns are deliberately still allowed.
    if (movementType === 'checkout' && (await getJobCloseOutAt({ db: tx, jobId: input.jobId })) !== null) {
      throw new JobClosedOutError(input.jobId);
    }
    const unitClass = unitClassFor(part.unitOfMeasure);

    assertDeltaMatchesUnitClass(input.quantity, unitClass);
    assertLengthMatchesUnitClass(input.lengthMm, unitClass);
    if (part.stockTrackingMode === 'periodic') throw new PeriodicStockMovementError(movementType);

    const [context, unitCost] = await Promise.all([
      loadStockMovementContext(tx, input),
      movementType === 'checkout' ? deriveCheckoutUnitCost(tx, input) : deriveReturnUnitCost(tx, input),
    ]);

    const movement = await insertMovement(tx, {
      actorUserId: movementActorUserId,
      delta: movementType === 'checkout' ? -input.quantity : input.quantity,
      jobId: input.jobId,
      lengthMm: input.lengthMm,
      movementType,
      partId: input.partId,
      unitCost,
    });

    return StockMovementPostResultSchema.parse({
      movement,
      warnings: deriveStockMovementWarnings({ context, movementType, quantity: input.quantity }),
    });
  });
}

export async function listJobStock({ db, jobId }: { db: Db; jobId: UUID }): Promise<JobStockResult> {
  const job = await loadJobStockJob({ db, jobId });
  const commitmentReleased = job.closedOutAt !== null || job.cancelledAt !== null;
  const [cfoByPart, movementRows] = await Promise.all([
    loadCfoQuantitiesByPart({ db, jobId }),
    db
      .select({
        drawnQuantity: sql<number>`(-sum(${stockMovements.delta}))::double precision`,
        lengthMm: stockMovements.lengthMm,
        partId: stockMovements.partId,
      })
      .from(stockMovements)
      .where(and(eq(stockMovements.jobId, jobId), inArray(stockMovements.movementType, JOB_STOCK_MOVEMENT_TYPES)))
      .groupBy(stockMovements.partId, stockMovements.lengthMm),
  ]);

  const movementsByPart = groupBy(movementRows, (row) => row.partId);
  const partIds = [...new Set([...cfoByPart.keys(), ...movementsByPart.keys()])];
  if (partIds.length === 0) {
    return JobStockResultSchema.parse({ items: [], job });
  }

  // Free and on-order ride this read because the Job's stock tab is one of the two places buying is
  // decided (spec §3, §4). Sourcing them here rather than from a second report keeps the tab's
  // suggestion identical to the buy list's, so the two surfaces cannot ask for different quantities.
  const [partRows, plantStock] = await Promise.all([
    db
      .select({
        code: parts.code,
        id: parts.id,
        isInternallyFabricated: parts.isInternallyFabricated,
        name: parts.name,
        standardPurchaseLengthMm: parts.standardPurchaseLengthMm,
        supplierName: supplier.companyName,
        unitOfMeasure: parts.unitOfMeasure,
      })
      .from(parts)
      .leftJoin(supplier, eq(supplier.id, parts.supplierId))
      .where(inArray(parts.id, partIds))
      .orderBy(asc(parts.code), asc(parts.id)),
    loadPlantStockPosition({ db, partIds }),
  ]);

  return JobStockResultSchema.parse({
    items: partRows.map((part) => {
      const movementBuckets = movementsByPart.get(part.id) ?? [];
      const cfoQuantity = cfoByPart.get(part.id) ?? 0;
      const drawnQuantity = sumBy(movementBuckets, (row) => row.drawnQuantity);

      return {
        cfoQuantity,
        committedQuantity: deriveCommitment({ cfoQuantity, drawnQuantity, isClosedOut: commitmentReleased }),
        drawnQuantity,
        freeQuantity: plantStock.freeByPart.get(part.id) ?? 0,
        isInternallyFabricated: part.isInternallyFabricated,
        lengthBuckets: movementBuckets
          .flatMap((row) =>
            row.lengthMm === null ? [] : [{ drawnQuantity: row.drawnQuantity, lengthMm: row.lengthMm }],
          )
          .sort((left, right) => left.lengthMm - right.lengthMm),
        onOrder: plantStock.onOrderByPart.get(part.id) ?? 0,
        partCode: part.code,
        partId: part.id,
        partName: part.name,
        standardPurchaseLengthMm: part.standardPurchaseLengthMm,
        supplierName: part.supplierName,
        unitOfMeasure: part.unitOfMeasure,
      };
    }),
    job,
  });
}

/**
 * Free Stock and On Order for a named set of Parts. Both are plant-wide facts — every Job's
 * commitment eats the same shelf, and every open order feeds it — so they are read across the plant
 * and narrowed to the Parts asked for, never scoped to the calling Job.
 */
async function loadPlantStockPosition({
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

export async function listStockOnHand({ db }: { db: Db }): Promise<StockOnHandResult> {
  // Quantity and valuation are one report fact; concurrent postings must not split their snapshots.
  return db.transaction((tx) => listStockOnHandSnapshot(tx), {
    accessMode: 'read only',
    isolationLevel: 'repeatable read',
  });
}

/**
 * The stock position of one Part, addressed the way the shop addresses it: by the code on its label.
 *
 * A scan resolves through here rather than through an id lookup because the tablet's part-result
 * screen wants the same figures the stock report shows — quantity, free, and the length buckets the
 * checkout screen then asks a question about. One read, one snapshot, no second round trip.
 *
 * The match is exact and case-sensitive. A Code 128 read either succeeds whole or fails, so a fuzzy
 * match here could only ever resolve a *mis*-read — and resolving a mis-read to a neighbouring Part
 * is how stock moves against the wrong code. A damaged label is retyped through search instead.
 */
export async function getPartStockByCode({ code, db }: { code: string; db: Db }): Promise<StockOnHandRow> {
  const [part] = await db.select({ id: parts.id }).from(parts).where(eq(parts.code, code)).limit(1);
  if (!part) throw new ScannedPartNotFoundError(code);

  const snapshot = await db.transaction((tx) => listStockOnHandSnapshot(tx, part.id), {
    accessMode: 'read only',
    isolationLevel: 'repeatable read',
  });
  const row = snapshot.items[0];
  // The Part was read a moment ago, so an empty snapshot means it was deleted between the two reads.
  if (!row) throw new ScannedPartNotFoundError(code);

  return row;
}

async function listStockOnHandSnapshot(db: DatabaseTransaction, partId?: UUID): Promise<StockOnHandResult> {
  const partCondition = partId === undefined ? undefined : eq(parts.id, partId);
  const [bucketRows, movementRows, committedByPart] = await Promise.all([
    db
      .select({
        isInternallyFabricated: parts.isInternallyFabricated,
        lengthMm: stockMovements.lengthMm,
        partCode: parts.code,
        partId: parts.id,
        partName: parts.name,
        quantity: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::double precision`,
        standardPurchaseLengthMm: parts.standardPurchaseLengthMm,
        stockTrackingMode: parts.stockTrackingMode,
        unitOfMeasure: parts.unitOfMeasure,
      })
      .from(parts)
      // A revaluation moves cost, never quantity, so it must not open a length bucket of its own.
      .leftJoin(
        stockMovements,
        and(eq(stockMovements.partId, parts.id), ne(stockMovements.movementType, 'revaluation')),
      )
      .where(partCondition)
      .groupBy(
        parts.id,
        parts.code,
        parts.name,
        parts.standardPurchaseLengthMm,
        parts.stockTrackingMode,
        parts.unitOfMeasure,
        stockMovements.lengthMm,
      )
      .orderBy(asc(parts.code), asc(stockMovements.lengthMm)),
    db
      .select({
        createdAt: stockMovements.createdAt,
        delta: stockMovements.delta,
        lengthMm: stockMovements.lengthMm,
        movementType: stockMovements.movementType,
        partId: stockMovements.partId,
        reason: stockMovements.reason,
        unitCost: stockMovements.unitCost,
      })
      .from(stockMovements)
      .where(partId === undefined ? undefined : eq(stockMovements.partId, partId))
      .orderBy(asc(stockMovements.partId), asc(stockMovements.createdAt), asc(stockMovements.id)),
    loadOpenCommitments(db, partId === undefined ? undefined : [partId]).then(sumCommitmentsByPart),
  ]);

  const movementsByPart = groupBy(movementRows, (row) => row.partId);
  const lastCountByPart = new Map(
    movementRows.flatMap((row) => (row.reason === 'stock-count' ? [[row.partId, row.createdAt] as const] : [])),
  );

  return StockOnHandResultSchema.parse({
    // Grouping preserves the query's ordering, so the head bucket carries the Part's own columns.
    items: [...groupBy(bucketRows, (row) => row.partId).values()].map(([part, ...tailBuckets]) => {
      const averageUnitCost = deriveMovingAverage(movementsByPart.get(part.partId) ?? []);
      const buckets = [part, ...tailBuckets].map((bucket) => ({
        lengthMm: bucket.lengthMm,
        quantity: bucket.quantity,
        totalValue: valueStockBucket({ averageUnitCost, lengthMm: bucket.lengthMm, quantity: bucket.quantity }),
      }));
      const committed = committedByPart.get(part.partId) ?? 0;
      const quantity = sumBy(buckets, (bucket) => bucket.quantity);

      return {
        asOfLastCount: part.stockTrackingMode === 'periodic' ? (lastCountByPart.get(part.partId) ?? null) : null,
        averageUnitCost,
        buckets,
        committed,
        free: quantity - committed,
        isInternallyFabricated: part.isInternallyFabricated,
        partCode: part.partCode,
        partId: part.partId,
        partName: part.partName,
        quantity,
        standardPurchaseLengthMm: part.standardPurchaseLengthMm,
        stockTrackingMode: part.stockTrackingMode,
        totalValue: buckets.reduce<number | null>(
          (total, bucket) => (total === null || bucket.totalValue === null ? null : total + bucket.totalValue),
          0,
        ),
        unitOfMeasure: part.unitOfMeasure,
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
      reason: stockMovements.reason,
      runningBalance: sql<number>`(sum(${stockMovements.delta}) over (order by ${stockMovements.createdAt}, ${stockMovements.id}))::double precision`,
      stocktakeSessionId: stockMovements.stocktakeSessionId,
      stocktakeSessionScope: stocktakeSessions.scope,
      unitCost: stockMovements.unitCost,
    })
    .from(stockMovements)
    .innerJoin(user, eq(user.id, stockMovements.actorUserId))
    .leftJoin(purchaseOrders, eq(purchaseOrders.id, stockMovements.purchaseOrderId))
    .leftJoin(jobs, eq(jobs.id, stockMovements.jobId))
    .leftJoin(stocktakeSessions, eq(stocktakeSessions.id, stockMovements.stocktakeSessionId))
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

/** Loads the four stock facts a Job movement is judged against, all scoped to its Job, Part, bucket. */
async function loadStockMovementContext(
  db: DatabaseTransaction,
  input: PostJobMovementInput,
): Promise<StockMovementContext> {
  const bucketCondition = bucketMatches(input.lengthMm);
  const drawnCondition = and(
    eq(stockMovements.jobId, input.jobId),
    eq(stockMovements.partId, input.partId),
    inArray(stockMovements.movementType, JOB_STOCK_MOVEMENT_TYPES),
  );
  const [bucketQuantityOnHand, cfoQuantity, drawnQuantity, drawnBucketQuantity] = await Promise.all([
    sumDelta(
      db,
      and(eq(stockMovements.partId, input.partId), ne(stockMovements.movementType, 'revaluation'), bucketCondition),
    ),
    scalar(
      db
        .select({ value: sql<number>`coalesce(sum(${jobCfoParts.quantity}), 0)::double precision` })
        .from(jobCfoAssemblies)
        .innerJoin(jobCfoParts, eq(jobCfoParts.cfoAssemblyId, jobCfoAssemblies.id))
        .where(and(eq(jobCfoAssemblies.jobId, input.jobId), eq(jobCfoParts.partId, input.partId))),
    ),
    sumDelta(db, drawnCondition).then((delta) => -delta),
    sumDelta(db, and(drawnCondition, bucketCondition)).then((delta) => -delta),
  ]);

  return { bucketQuantityOnHand, cfoQuantity, drawnBucketQuantity, drawnQuantity };
}

/**
 * A draw is stamped at the Part's current average, scaled to the piece length for linear stock.
 *
 * A Built Part is stamped the same way as any other. Spec §5's zero-cost rule is about sheet metal
 * cut from plate, whose material is charged through the raw-material lines — that Part's ledger
 * simply holds no costed rows, so the average is null ("no cost yet") without hardcoding it. A Part
 * built from *stocked* components is different: its build already moved that value onto it, and
 * dropping the value here would make it vanish at the next hop instead of reaching the Job.
 */
async function deriveCheckoutUnitCost(db: DatabaseTransaction, input: PostJobMovementInput): Promise<number | null> {
  return derivePartUnitCost(db, input.partId, input.lengthMm);
}

/**
 * A Part's current average, scaled to the piece length for linear stock. Null when the ledger holds
 * no costed row yet ("no cost yet").
 */
async function derivePartUnitCost(
  db: DatabaseTransaction,
  partId: UUID,
  lengthMm: number | null,
): Promise<number | null> {
  const averages = await loadMovingAverages(db, [partId]);

  return scaleUnitCost(averages.get(partId) ?? null, lengthMm);
}

/**
 * A linear piece's stamped cost scales with its bucket length, so only matching-length draws can
 * establish the reversal price; the pool replay in `@pkg/domain` owns the rest of the rule.
 */
async function deriveReturnUnitCost(db: DatabaseTransaction, input: PostJobMovementInput): Promise<number | null> {
  const rows = await db
    .select({ delta: stockMovements.delta, unitCost: stockMovements.unitCost })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.jobId, input.jobId),
        eq(stockMovements.partId, input.partId),
        bucketMatches(input.lengthMm),
        inArray(stockMovements.movementType, JOB_STOCK_MOVEMENT_TYPES),
      ),
    )
    .orderBy(asc(stockMovements.createdAt), asc(stockMovements.id));

  return deriveOutstandingDrawUnitCost(rows, input.quantity);
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
