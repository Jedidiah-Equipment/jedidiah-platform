import { type DatabaseTransaction, type Db, user } from '@pkg/db';
import {
  jobCfoAssemblies,
  jobCfoParts,
  jobs,
  parts,
  purchaseOrders,
  stockMovements,
  stocktakeSessions,
  supplier,
} from '@pkg/db/equipment';
import { groupBy } from '@pkg/domain';
import {
  deriveCommitment,
  deriveMovementWarnings,
  deriveMovingAverage,
  deriveMovingAverageTimeline,
  deriveOutstandingDrawUnitCost,
  derivePartStockActions,
  isCheckoutWithoutJob,
  type JobMovementFacts,
  type StockMovementFacts,
  valueStockBucket,
  valueStockMovement,
} from '@pkg/domain/equipment';
import type { AuthId, UUID } from '@pkg/schema';
import type {
  CheckoutBasketLineResult,
  CheckoutBasketPostResult,
  JobStockMovementType,
  JobStockResult,
  PostAdjustmentInput,
  PostCheckoutBasketInput,
  PostCheckoutInput,
  PostJobMovementInput,
  PostReturnToStoreInput,
  PostRevaluationInput,
  StockMovement,
  StockMovementHistoryResult,
  StockMovementPostResult,
  StockOnHandResult,
  StockOnHandRow,
} from '@pkg/schema/equipment';
import {
  CheckoutBasketPostResult as CheckoutBasketPostResultSchema,
  isPeriodicStockAdjustmentReason,
  JOB_STOCK_MOVEMENT_TYPES,
  JobStockResult as JobStockResultSchema,
  StockMovementHistoryResult as StockMovementHistoryResultSchema,
  StockMovementPostResult as StockMovementPostResultSchema,
  StockOnHandResult as StockOnHandResultSchema,
  unitClassFor,
} from '@pkg/schema/equipment';
import { and, asc, eq, inArray, ne, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { lockJob, lockMutableJob } from '../jobs/job-mutation-guards.js';
import { loadOpenOrderLines } from '../purchase-orders/purchase-order-service.js';
import { CheckoutRecipientIneligibleError, InvalidSourceCheckoutError } from './checkout-errors.js';
import { JobClosedOutError } from './close-out-errors.js';
import { getJobCloseOutAt } from './close-out-service.js';

import { loadOpenCommitments, sumCommitmentsByPart } from './commitment-read.js';
import { loadEstimatedStockOnHand } from './estimated-stock-on-hand-read.js';
import { loadCfoQuantitiesByPart, loadJobStockJob } from './job-stock-facts.js';
import {
  assertBuiltPartCostIsDerived,
  bucketMatches,
  insertMovement,
  loadMovingAverages,
  loadStockPart,
  lockStockParts,
  scalar,
  scaleUnitCost,
  sumDelta,
} from './ledger.js';
import { resolveMovementActor } from './movement-actor.js';
import { assertPartStockAction } from './part-stock-action-errors.js';
import { eligibleRecipientCondition } from './recipient-read.js';
import { sumBy, sumNullableBy } from './row-grouping.js';
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

    // A Built Part is costed by what its build consumed, so there is no price for a revaluation to
    // correct — the Part is refused rather than only the cost it was asked to assert.
    assertPartStockAction(derivePartStockActions(part).revalue, { action: 'revalue', partId: input.partId });

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
 * Who a draw goes to, or a return comes back from. Every draw and return runs one posting path; the
 * target decides what is locked, which pool of rows a return reverses, and which columns name it.
 */
type DrawTarget =
  | { jobId: UUID; kind: 'job'; movementType: JobStockMovementType }
  /** A Checkout Without a Job: drawn to a person for a stated purpose, consumed on the spot. */
  | { kind: 'recipient'; note: string; recipientUserId: AuthId }
  /** A Return to Store linked to one Checkout Without a Job, which fixes its Part, length and Recipient. */
  | { kind: 'source'; source: SourceCheckout };

type SourceCheckout = { id: UUID; lengthMm: number | null; partId: UUID; recipientUserId: AuthId };

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
  return db.transaction((tx) =>
    postDraw(tx, {
      actorUserId,
      assertedActorUserId: input.actorUserId,
      lengthMm: input.lengthMm,
      partId: input.partId,
      quantity: input.quantity,
      target: { jobId: input.jobId, kind: 'job', movementType },
    }),
  );
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
  if ('jobId' in input) return postJobMovement({ actorUserId, db, input, movementType: 'checkout' });

  return db.transaction((tx) =>
    postDraw(tx, {
      actorUserId,
      assertedActorUserId: input.actorUserId,
      lengthMm: input.lengthMm,
      partId: input.partId,
      quantity: input.quantity,
      target: { kind: 'recipient', note: input.note, recipientUserId: input.recipientUserId },
    }),
  );
}

/** Posts every Checkout Basket line in one transaction, preserving ordinary ledger rows. */
export async function postCheckoutBasket({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PostCheckoutBasketInput;
}): Promise<CheckoutBasketPostResult> {
  const target: DrawTarget =
    'jobId' in input
      ? { jobId: input.jobId, kind: 'job', movementType: 'checkout' }
      : { kind: 'recipient', note: input.note, recipientUserId: input.recipientUserId };

  return db.transaction(async (tx) => {
    const partIds = [...new Set(input.lines.map((line) => line.partId))].sort();
    const partsById = await lockStockParts(tx, partIds);
    const session = await openDrawSession(tx, {
      actorUserId,
      assertedActorUserId: input.actorUserId,
      target,
    });
    const lines: CheckoutBasketLineResult[] = [];

    for (const line of input.lines) {
      const part = partsById.get(line.partId);
      if (!part) throw new StockMovementPartNotFoundError(line.partId);
      lines.push(await drawLine(tx, session, { lengthMm: line.lengthMm, part, quantity: line.quantity }));
    }

    return CheckoutBasketPostResultSchema.parse({
      lines,
      warnings: [...new Set(lines.flatMap((line) => line.warnings))],
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
  if ('jobId' in input) return postJobMovement({ actorUserId, db, input, movementType: 'return-to-store' });

  return db.transaction(async (tx) => {
    const source = await loadSourceCheckout(tx, input.sourceCheckoutId);

    return postDraw(tx, {
      actorUserId,
      assertedActorUserId: input.actorUserId,
      lengthMm: source.lengthMm,
      partId: source.partId,
      quantity: input.quantity,
      target: { kind: 'source', source },
    });
  });
}

async function postDraw(
  tx: DatabaseTransaction,
  {
    actorUserId,
    assertedActorUserId,
    lengthMm,
    partId,
    quantity,
    target,
  }: {
    actorUserId: AuthId;
    assertedActorUserId: AuthId | null | undefined;
    lengthMm: number | null;
    partId: UUID;
    quantity: number;
    target: DrawTarget;
  },
): Promise<StockMovementPostResult> {
  const part = await loadStockPart({ db: tx, lockForMovement: true, partId });
  const session = await openDrawSession(tx, { actorUserId, assertedActorUserId, target });

  return drawLine(tx, session, { lengthMm, part, quantity });
}

/** What one transaction settles once, whatever it goes on to post. */
type DrawSession = { movementActorUserId: AuthId; target: DrawTarget };

async function openDrawSession(
  tx: DatabaseTransaction,
  {
    actorUserId,
    assertedActorUserId,
    target,
  }: { actorUserId: AuthId; assertedActorUserId: AuthId | null | undefined; target: DrawTarget },
): Promise<DrawSession> {
  const movementActorUserId = await resolveMovementActor({ assertedActorUserId, db: tx, sessionUserId: actorUserId });
  await lockDrawTarget(tx, target);

  return { movementActorUserId, target };
}

/** One line against an already-locked Part and an open session. */
async function drawLine(
  tx: DatabaseTransaction,
  session: DrawSession,
  {
    lengthMm,
    part,
    quantity,
  }: { lengthMm: number | null; part: Awaited<ReturnType<typeof loadStockPart>>; quantity: number },
): Promise<StockMovementPostResult> {
  const movementType = drawMovementType(session.target);
  const unitClass = unitClassFor(part.unitOfMeasure);

  assertDeltaMatchesUnitClass(quantity, unitClass);
  assertLengthMatchesUnitClass(lengthMm, unitClass);
  // One lookup names both the verdict read and the words a refusal is phrased in.
  const action = movementType === 'checkout' ? 'checkout' : 'returnToStore';

  assertPartStockAction(derivePartStockActions(part)[action], { action, partId: part.id });

  const { facts, unitCost } = await loadDrawFacts(tx, { lengthMm, partId: part.id, quantity, target: session.target });
  const movement = await insertMovement(tx, {
    actorUserId: session.movementActorUserId,
    delta: movementType === 'checkout' ? -quantity : quantity,
    lengthMm,
    movementType,
    partId: part.id,
    unitCost,
    ...drawColumns(session.target),
  });

  return StockMovementPostResultSchema.parse({ movement, warnings: deriveMovementWarnings({ facts, quantity }) });
}

function drawMovementType(target: DrawTarget): JobStockMovementType {
  switch (target.kind) {
    case 'job':
      return target.movementType;
    case 'recipient':
      return 'checkout';
    case 'source':
      return 'return-to-store';
  }
}

function drawColumns(target: DrawTarget): Partial<typeof stockMovements.$inferInsert> {
  switch (target.kind) {
    case 'job':
      return { jobId: target.jobId };
    case 'recipient':
      return { note: target.note, recipientUserId: target.recipientUserId };
    case 'source':
      return { recipientUserId: target.source.recipientUserId, sourceCheckoutId: target.source.id };
  }
}

async function lockDrawTarget(tx: DatabaseTransaction, target: DrawTarget): Promise<void> {
  switch (target.kind) {
    case 'job':
      await (target.movementType === 'checkout' ? lockMutableJob(tx, target.jobId) : lockJob(tx, target.jobId));
      // Close-out ended this Job's stock life; a later draw would sit against it unprompted forever,
      // since a closed Job can never re-enter the queue. Returns are deliberately still allowed.
      if (target.movementType === 'checkout' && (await getJobCloseOutAt({ db: tx, jobId: target.jobId })) !== null) {
        throw new JobClosedOutError(target.jobId);
      }
      return;
    case 'recipient':
      await assertEligibleRecipient(tx, target.recipientUserId);
      return;
    case 'source':
      // Validated when it was loaded, and immutable ledger history since; the Part lock serializes
      // the returns that pool against it.
      return;
  }
}

/**
 * What the movement is judged against and stamped with, both read from the pool its target names.
 * A draw is stamped at the Part's current average; a return reverses its pool's outstanding draws
 * at the cost they left with (`deriveOutstandingDrawUnitCost`).
 */
async function loadDrawFacts(
  db: DatabaseTransaction,
  {
    lengthMm,
    partId,
    quantity,
    target,
  }: { lengthMm: number | null; partId: UUID; quantity: number; target: DrawTarget },
): Promise<{ facts: StockMovementFacts; unitCost: number | null }> {
  switch (target.kind) {
    case 'job': {
      const [context, unitCost] = await Promise.all([
        loadStockMovementContext(db, { jobId: target.jobId, lengthMm, partId }),
        target.movementType === 'checkout'
          ? deriveCheckoutUnitCost(db, partId, lengthMm)
          : deriveReturnUnitCost(db, jobDrawPool(target.jobId, partId, lengthMm), quantity),
      ]);

      return { facts: { ...context, kind: target.movementType }, unitCost };
    }
    case 'recipient': {
      const [bucketQuantityOnHand, unitCost] = await Promise.all([
        sumDelta(db, bucketOnHandMatches(partId, lengthMm)),
        deriveCheckoutUnitCost(db, partId, lengthMm),
      ]);

      // No Job, so nothing planned this draw: a CFO of zero is what "no CFO" means to the judgement.
      return { facts: { bucketQuantityOnHand, cfoQuantity: 0, drawnQuantity: 0, kind: 'checkout' }, unitCost };
    }
    case 'source': {
      const pool = sourceDrawPool(target.source.id);
      const [outstanding, unitCost] = await Promise.all([
        sumDelta(db, pool).then((delta) => -delta),
        deriveReturnUnitCost(db, pool, quantity),
      ]);

      return { facts: { drawnBucketQuantity: outstanding, kind: 'return-to-store' }, unitCost };
    }
  }
}

/** A Job's draws and returns of one Part in one length bucket: what a Job return reverses. */
function jobDrawPool(jobId: UUID, partId: UUID, lengthMm: number | null): SQL {
  return and(
    eq(stockMovements.jobId, jobId),
    eq(stockMovements.partId, partId),
    bucketMatches(lengthMm),
    inArray(stockMovements.movementType, JOB_STOCK_MOVEMENT_TYPES),
  ) as SQL;
}

/** One Checkout Without a Job and the returns linked to it: what a source-linked return reverses. */
function sourceDrawPool(sourceCheckoutId: UUID): SQL {
  return or(eq(stockMovements.id, sourceCheckoutId), eq(stockMovements.sourceCheckoutId, sourceCheckoutId)) as SQL;
}

/** Stock on hand in one bucket is every non-revaluation row of it; a revaluation moves cost, never quantity. */
function bucketOnHandMatches(partId: UUID, lengthMm: number | null): SQL {
  return and(
    eq(stockMovements.partId, partId),
    ne(stockMovements.movementType, 'revaluation'),
    bucketMatches(lengthMm),
  ) as SQL;
}

async function loadSourceCheckout(db: DatabaseTransaction, sourceCheckoutId: UUID): Promise<SourceCheckout> {
  const [row] = await db
    .select({
      id: stockMovements.id,
      jobId: stockMovements.jobId,
      lengthMm: stockMovements.lengthMm,
      movementType: stockMovements.movementType,
      partId: stockMovements.partId,
      recipientUserId: stockMovements.recipientUserId,
    })
    .from(stockMovements)
    .where(eq(stockMovements.id, sourceCheckoutId))
    .limit(1);
  if (!row || !isCheckoutWithoutJob(row)) throw new InvalidSourceCheckoutError(sourceCheckoutId);

  return row;
}

async function assertEligibleRecipient(db: DatabaseTransaction, recipientUserId: AuthId): Promise<void> {
  const [recipient] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, recipientUserId), eligibleRecipientCondition()))
    .limit(1);
  if (!recipient) throw new CheckoutRecipientIneligibleError(recipientUserId);
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
        stockTrackingMode: parts.stockTrackingMode,
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
        stockTrackingMode: part.stockTrackingMode,
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
  const [bucketRows, movementRows, committedByPart, openOrderLines] = await Promise.all([
    db
      .select({
        averageUtilizationPercent: parts.averageUtilizationPercent,
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
    loadOpenOrderLines(partId === undefined ? { db } : { db, partIds: [partId] }),
  ]);

  const movementsByPart = groupBy(movementRows, (row) => row.partId);
  const lastCountByPart = new Map(
    movementRows.flatMap((row) => (row.reason === 'stock-count' ? [[row.partId, row.createdAt] as const] : [])),
  );
  const onOrderByPart = new Map<UUID, number>();
  for (const line of openOrderLines) {
    onOrderByPart.set(line.partId, (onOrderByPart.get(line.partId) ?? 0) + line.outstandingQuantity);
  }

  // Grouping preserves the query's ordering, so the head bucket carries the Part's own columns.
  const items = [...groupBy(bucketRows, (row) => row.partId).values()].map(([part, ...tailBuckets]) => {
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
      onOrder: onOrderByPart.get(part.partId) ?? 0,
      partCode: part.partCode,
      partId: part.partId,
      partName: part.partName,
      quantity,
      standardPurchaseLengthMm: part.standardPurchaseLengthMm,
      stockTrackingMode: part.stockTrackingMode,
      totalValue: sumNullableBy(buckets, (bucket) => bucket.totalValue),
      unitOfMeasure: part.unitOfMeasure,
      averageUtilizationPercent: part.averageUtilizationPercent,
    };
  });
  const throughAt = new Date();
  const estimates = await loadEstimatedStockOnHand(
    db,
    items.flatMap((item) => {
      if (item.averageUtilizationPercent === null) return [];

      const movementHistory = movementsByPart.get(item.partId) ?? [];
      return [
        {
          anchorAt: lastCountByPart.get(item.partId) ?? null,
          averageUtilizationPercent: item.averageUtilizationPercent,
          key: item.partId,
          originAt: movementHistory[0]?.createdAt ?? null,
          partId: item.partId,
          recordedOnHand: item.quantity,
          throughAt,
        },
      ];
    }),
  );

  return StockOnHandResultSchema.parse({
    items: items.map(({ averageUtilizationPercent: _averageUtilizationPercent, ...item }) => ({
      ...item,
      estimatedOnHand: estimates.get(item.partId) ?? null,
    })),
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

/** Loads the four stock facts a Job movement is judged against, all scoped to its Job, Part, bucket. */
async function loadStockMovementContext(
  db: DatabaseTransaction,
  { jobId, lengthMm, partId }: { jobId: UUID; lengthMm: number | null; partId: UUID },
): Promise<JobMovementFacts> {
  const bucketCondition = bucketMatches(lengthMm);
  const drawnCondition = and(
    eq(stockMovements.jobId, jobId),
    eq(stockMovements.partId, partId),
    inArray(stockMovements.movementType, JOB_STOCK_MOVEMENT_TYPES),
  );
  const [bucketQuantityOnHand, cfoQuantity, drawnQuantity, drawnBucketQuantity] = await Promise.all([
    sumDelta(db, bucketOnHandMatches(partId, lengthMm)),
    scalar(
      db
        .select({ value: sql<number>`coalesce(sum(${jobCfoParts.quantity}), 0)::double precision` })
        .from(jobCfoAssemblies)
        .innerJoin(jobCfoParts, eq(jobCfoParts.cfoAssemblyId, jobCfoAssemblies.id))
        .where(and(eq(jobCfoAssemblies.jobId, jobId), eq(jobCfoParts.partId, partId))),
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
async function deriveCheckoutUnitCost(
  db: DatabaseTransaction,
  partId: UUID,
  lengthMm: number | null,
): Promise<number | null> {
  return derivePartUnitCost(db, partId, lengthMm);
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
 * A return reverses the pool's outstanding draws at the cost they were stamped with. A linear
 * piece's stamped cost scales with its bucket length, so a Job pool is one bucket and a source
 * pool is the one Checkout it names; the pool replay in `@pkg/domain` owns the rest of the rule.
 */
async function deriveReturnUnitCost(db: DatabaseTransaction, pool: SQL, quantity: number): Promise<number | null> {
  const rows = await db
    .select({ delta: stockMovements.delta, unitCost: stockMovements.unitCost })
    .from(stockMovements)
    .where(pool)
    .orderBy(asc(stockMovements.createdAt), asc(stockMovements.id));

  return deriveOutstandingDrawUnitCost(rows, quantity);
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
