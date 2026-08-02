import {
  type DatabaseTransaction,
  type Db,
  jobCfoAssemblies,
  jobCfoParts,
  jobs,
  parts,
  stockMovements,
  user,
} from '@pkg/db';
import {
  deriveCommitment,
  deriveMovingAverage,
  deriveMovingAverageTimeline,
  valueStockBucket,
  valueStockMovement,
} from '@pkg/domain';
import type {
  AuthId,
  JobStockResult,
  PartUnitClass,
  PostAdjustmentInput,
  PostCheckoutInput,
  PostReturnToStoreInput,
  PostRevaluationInput,
  StockMovement,
  StockMovementHistoryResult,
  StockMovementPostResult,
  StockOnHandResult,
  UUID,
} from '@pkg/schema';
import {
  JobStockResult as JobStockResultSchema,
  StockMovementHistoryResult as StockMovementHistoryResultSchema,
  StockMovementPostResult as StockMovementPostResultSchema,
  StockMovement as StockMovementSchema,
  StockOnHandResult as StockOnHandResultSchema,
  unitClassFor,
} from '@pkg/schema';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { JobNotFoundError } from '../jobs/job-errors.js';
import { lockJob, lockMutableJob } from '../jobs/job-mutation-guards.js';

import {
  FabricatedPartCostError,
  PeriodicStockAdjustmentError,
  StockMovementDeltaError,
  StockMovementLengthError,
  StockMovementPartNotFoundError,
} from './stock-movement-errors.js';

type StockMovementDatabase = Db | DatabaseTransaction;

export async function postAdjustment({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PostAdjustmentInput;
}): Promise<StockMovement> {
  return db.transaction((tx) => postAdjustmentInTransaction({ actorUserId, db: tx, input }));
}

async function postAdjustmentInTransaction({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: DatabaseTransaction;
  input: PostAdjustmentInput;
}): Promise<StockMovement> {
  const part = await loadStockPart({ db, lockForMovement: true, partId: input.partId });
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
  return db.transaction((tx) => postRevaluationInTransaction({ actorUserId, db: tx, input }));
}

async function postRevaluationInTransaction({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: DatabaseTransaction;
  input: PostRevaluationInput;
}): Promise<StockMovement> {
  const part = await loadStockPart({ db, lockForMovement: true, partId: input.partId });

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

export async function postCheckout({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PostCheckoutInput;
}): Promise<StockMovementPostResult> {
  return db.transaction(async (tx) => {
    const part = await loadStockPart({ db: tx, lockForMovement: true, partId: input.partId });
    await lockMutableJob(tx, input.jobId);
    const unitClass = unitClassFor(part.unitOfMeasure);

    assertDeltaMatchesUnitClass(input.quantity, unitClass);
    assertLengthMatchesUnitClass(input.lengthMm, unitClass);
    if (part.stockTrackingMode === 'periodic') {
      throw new PeriodicStockAdjustmentError('checkout');
    }

    const [orderedMovements, cfoQuantity, drawnQuantity, stockOnHand] = await Promise.all([
      loadOrderedPartMovements({ db: tx, partId: input.partId }),
      getJobPartCfoQuantity({ db: tx, jobId: input.jobId, partId: input.partId }),
      getJobPartDrawnQuantity({ db: tx, jobId: input.jobId, partId: input.partId }),
      getStockBucketQuantity({ db: tx, lengthMm: input.lengthMm, partId: input.partId }),
    ]);
    const movingAverage = part.isInternallyFabricated ? 0 : deriveMovingAverage(orderedMovements);
    const unitCost =
      movingAverage === null ? null : input.lengthMm === null ? movingAverage : movingAverage * input.lengthMm;

    const movement = await insertJobMovement({
      actorUserId,
      db: tx,
      delta: -input.quantity,
      input,
      movementType: 'checkout',
      unitCost,
    });

    return StockMovementPostResultSchema.parse({
      movement,
      warnings: {
        exceedsCfo: drawnQuantity + input.quantity > cfoQuantity,
        exceedsDrawn: false,
        negativeStockOnHand: stockOnHand - input.quantity < 0,
      },
    });
  });
}

export async function postReturnToStore({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PostReturnToStoreInput;
}): Promise<StockMovementPostResult> {
  return db.transaction(async (tx) => {
    const part = await loadStockPart({ db: tx, lockForMovement: true, partId: input.partId });
    // Returns remain valid after cancellation so physically recovered stock is not stranded off-ledger.
    await lockJob(tx, input.jobId);
    const unitClass = unitClassFor(part.unitOfMeasure);

    assertDeltaMatchesUnitClass(input.quantity, unitClass);
    assertLengthMatchesUnitClass(input.lengthMm, unitClass);
    if (part.stockTrackingMode === 'periodic') {
      throw new PeriodicStockAdjustmentError('return-to-store');
    }

    const [drawnQuantity, jobMovementRows] = await Promise.all([
      getJobPartDrawnQuantity({
        db: tx,
        jobId: input.jobId,
        lengthMm: input.lengthMm,
        partId: input.partId,
      }),
      tx
        .select({
          delta: stockMovements.delta,
          movementType: stockMovements.movementType,
          unitCost: stockMovements.unitCost,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.jobId, input.jobId),
            eq(stockMovements.partId, input.partId),
            input.lengthMm === null
              ? sql`${stockMovements.lengthMm} IS NULL`
              : eq(stockMovements.lengthMm, input.lengthMm),
            inArray(stockMovements.movementType, ['checkout', 'return-to-store']),
          ),
        )
        .orderBy(asc(stockMovements.createdAt), asc(stockMovements.id)),
    ]);

    // A linear piece's stamped cost scales with its bucket length, so only matching-length draws
    // can establish the reversal price. Any unknown stamp keeps the return honestly uncosted.
    const unitCost = deriveOutstandingDrawUnitCost(jobMovementRows, input.quantity);
    const movement = await insertJobMovement({
      actorUserId,
      db: tx,
      delta: input.quantity,
      input,
      movementType: 'return-to-store',
      unitCost,
    });

    return StockMovementPostResultSchema.parse({
      movement,
      warnings: {
        exceedsCfo: false,
        exceedsDrawn: input.quantity > drawnQuantity,
        negativeStockOnHand: false,
      },
    });
  });
}

export async function listJobStock({
  db,
  isClosedOut = false,
  jobId,
}: {
  db: Db;
  isClosedOut?: boolean;
  jobId: UUID;
}): Promise<JobStockResult> {
  const job = await loadStockMovementJob({ db, jobId });
  const commitmentReleased = isClosedOut || job.cancelledAt !== null;
  const [cfoRows, movementRows] = await Promise.all([
    db
      .select({
        cfoQuantity: sql<number>`sum(${jobCfoParts.quantity})::double precision`,
        partId: jobCfoParts.partId,
      })
      .from(jobCfoAssemblies)
      .innerJoin(jobCfoParts, eq(jobCfoParts.cfoAssemblyId, jobCfoAssemblies.id))
      .where(eq(jobCfoAssemblies.jobId, jobId))
      .groupBy(jobCfoParts.partId),
    db
      .select({
        drawnQuantity: sql<number>`(-sum(${stockMovements.delta}))::double precision`,
        lengthMm: stockMovements.lengthMm,
        partId: stockMovements.partId,
      })
      .from(stockMovements)
      .where(
        and(eq(stockMovements.jobId, jobId), inArray(stockMovements.movementType, ['checkout', 'return-to-store'])),
      )
      .groupBy(stockMovements.partId, stockMovements.lengthMm),
  ]);

  const cfoByPart = new Map(cfoRows.map((row) => [row.partId, row.cfoQuantity]));
  const movementsByPart = new Map<UUID, typeof movementRows>();
  for (const row of movementRows) {
    const rows = movementsByPart.get(row.partId) ?? [];
    rows.push(row);
    movementsByPart.set(row.partId, rows);
  }
  const partIds = [...new Set([...cfoByPart.keys(), ...movementsByPart.keys()])];
  if (partIds.length === 0) {
    return { items: [] };
  }

  const partRows = await db
    .select({
      code: parts.code,
      id: parts.id,
      name: parts.name,
      standardPurchaseLengthMm: parts.standardPurchaseLengthMm,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(parts)
    .where(inArray(parts.id, partIds))
    .orderBy(asc(parts.code), asc(parts.id));

  return JobStockResultSchema.parse({
    items: partRows.map((part) => {
      const movementBuckets = movementsByPart.get(part.id) ?? [];
      const cfoQuantity = cfoByPart.get(part.id) ?? 0;
      const drawnQuantity = movementBuckets.reduce((sum, row) => sum + row.drawnQuantity, 0);

      return {
        cfoQuantity,
        committedQuantity: deriveCommitment({ cfoQuantity, drawnQuantity, isClosedOut: commitmentReleased }),
        drawnQuantity,
        lengthBuckets: movementBuckets
          .flatMap((row) =>
            row.lengthMm === null ? [] : [{ drawnQuantity: row.drawnQuantity, lengthMm: row.lengthMm }],
          )
          .sort((left, right) => left.lengthMm - right.lengthMm),
        partCode: part.code,
        partId: part.id,
        partName: part.name,
        standardPurchaseLengthMm: part.standardPurchaseLengthMm,
        unitOfMeasure: part.unitOfMeasure,
      };
    }),
  });
}

export async function listStockOnHand({ db }: { db: Db }): Promise<StockOnHandResult> {
  // Quantity and valuation are one report fact; concurrent postings must not split their snapshots.
  return db.transaction((tx) => listStockOnHandSnapshot(tx), {
    accessMode: 'read only',
    isolationLevel: 'repeatable read',
  });
}

async function listStockOnHandSnapshot(db: DatabaseTransaction): Promise<StockOnHandResult> {
  const [quantityRows, movementRows, commitmentRows] = await Promise.all([
    db
      .select({
        lengthMm: stockMovements.lengthMm,
        isInternallyFabricated: parts.isInternallyFabricated,
        partCode: parts.code,
        partId: parts.id,
        partName: parts.name,
        quantity: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::double precision`,
        standardPurchaseLengthMm: parts.standardPurchaseLengthMm,
        stockTrackingMode: parts.stockTrackingMode,
        unitOfMeasure: parts.unitOfMeasure,
      })
      .from(parts)
      .leftJoin(
        stockMovements,
        and(eq(stockMovements.partId, parts.id), ne(stockMovements.movementType, 'revaluation')),
      )
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
      .orderBy(asc(stockMovements.partId), asc(stockMovements.createdAt), asc(stockMovements.id)),
    listOpenCommitments(db),
  ]);

  const movementsByPart = new Map<UUID, typeof movementRows>();
  const asOfLastCountByPart = new Map<UUID, Date>();
  for (const movement of movementRows) {
    const partMovements = movementsByPart.get(movement.partId) ?? [];
    partMovements.push(movement);
    movementsByPart.set(movement.partId, partMovements);

    if (movement.reason === 'stock-count') {
      asOfLastCountByPart.set(movement.partId, movement.createdAt);
    }
  }

  const averageUnitCostByPart = new Map<UUID, number | null>();
  const totalQuantityByPart = new Map<UUID, number>();
  for (const row of quantityRows) {
    totalQuantityByPart.set(row.partId, (totalQuantityByPart.get(row.partId) ?? 0) + row.quantity);
    if (!averageUnitCostByPart.has(row.partId)) {
      averageUnitCostByPart.set(
        row.partId,
        row.isInternallyFabricated ? 0 : deriveMovingAverage(movementsByPart.get(row.partId) ?? []),
      );
    }
  }

  return StockOnHandResultSchema.parse({
    items: quantityRows.map((row) => {
      const averageUnitCost = averageUnitCostByPart.get(row.partId) ?? null;
      const committed = commitmentRows.get(row.partId) ?? 0;

      return {
        averageUnitCost,
        asOfLastCount: row.stockTrackingMode === 'periodic' ? (asOfLastCountByPart.get(row.partId) ?? null) : null,
        committed,
        free: (totalQuantityByPart.get(row.partId) ?? 0) - committed,
        isInternallyFabricated: row.isInternallyFabricated,
        lengthMm: row.lengthMm,
        partCode: row.partCode,
        partId: row.partId,
        partName: row.partName,
        quantity: row.quantity,
        standardPurchaseLengthMm: row.standardPurchaseLengthMm,
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
      jobId: stockMovements.jobId,
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

async function loadStockPart({
  db,
  lockForMovement = false,
  partId,
}: {
  db: StockMovementDatabase;
  lockForMovement?: boolean;
  partId: UUID;
}) {
  const query = db
    .select({
      id: parts.id,
      isInternallyFabricated: parts.isInternallyFabricated,
      stockTrackingMode: parts.stockTrackingMode,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(parts)
    .where(eq(parts.id, partId))
    .limit(1);
  // Every writer takes the same Part lock so cost replay and the appended stamp form one ledger order.
  const [part] = lockForMovement ? await query.for('update') : await query;

  if (!part) {
    throw new StockMovementPartNotFoundError(partId);
  }

  return part;
}

async function loadStockMovementJob({ db, jobId }: { db: StockMovementDatabase; jobId: UUID }) {
  const [job] = await db
    .select({ cancelledAt: jobs.cancelledAt, id: jobs.id })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!job) {
    throw new JobNotFoundError(jobId);
  }
  return job;
}

async function insertJobMovement({
  actorUserId,
  db,
  delta,
  input,
  movementType,
  unitCost,
}: {
  actorUserId: AuthId;
  db: DatabaseTransaction;
  delta: number;
  input: PostCheckoutInput | PostReturnToStoreInput;
  movementType: 'checkout' | 'return-to-store';
  unitCost: number | null;
}): Promise<StockMovement> {
  const [movement] = await db
    .insert(stockMovements)
    .values({
      actorUserId,
      delta,
      jobId: input.jobId,
      lengthMm: input.lengthMm,
      movementType,
      note: null,
      partId: input.partId,
      reason: null,
      unitCost,
    })
    .returning();
  if (!movement) throw new Error('Stock movement insert did not return a row');
  return StockMovementSchema.parse(movement);
}

async function loadOrderedPartMovements({ db, partId }: { db: StockMovementDatabase; partId: UUID }) {
  return db
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
}

async function getJobPartCfoQuantity({
  db,
  jobId,
  partId,
}: {
  db: StockMovementDatabase;
  jobId: UUID;
  partId: UUID;
}): Promise<number> {
  const [row] = await db
    .select({ quantity: sql<number>`coalesce(sum(${jobCfoParts.quantity}), 0)::double precision` })
    .from(jobCfoAssemblies)
    .innerJoin(jobCfoParts, eq(jobCfoParts.cfoAssemblyId, jobCfoAssemblies.id))
    .where(and(eq(jobCfoAssemblies.jobId, jobId), eq(jobCfoParts.partId, partId)));
  return row?.quantity ?? 0;
}

async function getJobPartDrawnQuantity({
  db,
  jobId,
  lengthMm,
  partId,
}: {
  db: StockMovementDatabase;
  jobId: UUID;
  lengthMm?: number | null;
  partId: UUID;
}): Promise<number> {
  const [row] = await db
    .select({ quantity: sql<number>`coalesce(-sum(${stockMovements.delta}), 0)::double precision` })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.jobId, jobId),
        eq(stockMovements.partId, partId),
        inArray(stockMovements.movementType, ['checkout', 'return-to-store']),
        lengthMm === undefined
          ? undefined
          : lengthMm === null
            ? sql`${stockMovements.lengthMm} IS NULL`
            : eq(stockMovements.lengthMm, lengthMm),
      ),
    );
  return row?.quantity ?? 0;
}

async function getStockBucketQuantity({
  db,
  lengthMm,
  partId,
}: {
  db: StockMovementDatabase;
  lengthMm: number | null;
  partId: UUID;
}): Promise<number> {
  const [row] = await db
    .select({ quantity: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::double precision` })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.partId, partId),
        ne(stockMovements.movementType, 'revaluation'),
        lengthMm === null ? sql`${stockMovements.lengthMm} IS NULL` : eq(stockMovements.lengthMm, lengthMm),
      ),
    );
  return row?.quantity ?? 0;
}

function deriveOutstandingDrawUnitCost(
  rows: ReadonlyArray<{
    delta: number;
    movementType: 'adjustment' | 'checkout' | 'return-to-store' | 'revaluation';
    unitCost: number | null;
  }>,
  returnQuantity: number,
): number | null {
  let hasUnknownCost = false;
  let quantity = 0;
  let value = 0;

  for (const row of rows) {
    if (row.movementType === 'checkout') {
      const checkoutQuantity = Math.abs(row.delta);
      quantity += checkoutQuantity;
      if (row.unitCost === null) {
        hasUnknownCost = true;
      } else {
        value += checkoutQuantity * row.unitCost;
      }
      continue;
    }

    quantity -= row.delta;
    if (row.unitCost === null) {
      hasUnknownCost = true;
    } else {
      value -= row.delta * row.unitCost;
    }

    if (quantity <= 0) {
      quantity = 0;
      value = 0;
      hasUnknownCost = false;
    }
  }

  if (quantity === 0 || hasUnknownCost) return null;
  // Over-returns warn but still post. Spread only the outstanding Job value over the larger row so
  // the excess quantity does not invent inventory value or drive the Job's net material cost negative.
  return value / Math.max(quantity, returnQuantity);
}

async function listOpenCommitments(db: DatabaseTransaction): Promise<Map<UUID, number>> {
  const [cfoRows, drawnRows] = await Promise.all([
    db
      .select({
        cfoQuantity: sql<number>`sum(${jobCfoParts.quantity})::double precision`,
        jobId: jobCfoAssemblies.jobId,
        partId: jobCfoParts.partId,
      })
      .from(jobCfoAssemblies)
      .innerJoin(jobCfoParts, eq(jobCfoParts.cfoAssemblyId, jobCfoAssemblies.id))
      .innerJoin(jobs, eq(jobs.id, jobCfoAssemblies.jobId))
      .where(isNull(jobs.cancelledAt))
      .groupBy(jobCfoAssemblies.jobId, jobCfoParts.partId),
    db
      .select({
        drawnQuantity: sql<number>`(-sum(${stockMovements.delta}))::double precision`,
        jobId: stockMovements.jobId,
        partId: stockMovements.partId,
      })
      .from(stockMovements)
      .innerJoin(jobs, eq(jobs.id, stockMovements.jobId))
      .where(and(isNull(jobs.cancelledAt), inArray(stockMovements.movementType, ['checkout', 'return-to-store'])))
      .groupBy(stockMovements.jobId, stockMovements.partId),
  ]);
  const drawnByJobPart = new Map(
    drawnRows.flatMap((row) => (row.jobId ? [[`${row.jobId}:${row.partId}`, row.drawnQuantity] as const] : [])),
  );
  const committedByPart = new Map<UUID, number>();
  for (const row of cfoRows) {
    const drawnQuantity = drawnByJobPart.get(`${row.jobId}:${row.partId}`) ?? 0;
    committedByPart.set(
      row.partId,
      (committedByPart.get(row.partId) ?? 0) + deriveCommitment({ cfoQuantity: row.cfoQuantity, drawnQuantity }),
    );
  }
  return committedByPart;
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
