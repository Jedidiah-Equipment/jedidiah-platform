import {
  type DatabaseTransaction,
  type Db,
  isUniqueViolation,
  jobEstimateSnapshots,
  jobs,
  parts,
  stockMovements,
  stocktakeSessions,
  user,
  withPagination,
} from '@pkg/db';
import type { MovingAverageMovement } from '@pkg/domain';
import { deriveMovingAverageTimeline, deriveStocktakeOverdue, toPlantDateOnly, valueStockMovement } from '@pkg/domain';
import type {
  AuthId,
  CloseStocktakeSessionInput,
  OpenStocktakeSessionInput,
  PostStockCountInput,
  RawMaterialDriftReport,
  StockCountBucketVariance,
  StockCountResult,
  StocktakeOverdueResult,
  StocktakeSession,
  StocktakeSessionCount,
  StocktakeSessionListResult,
  StocktakeSessionReport,
  StocktakeUncountedInput,
  StocktakeUncountedResult,
  UUID,
} from '@pkg/schema';
import {
  getNextCursor,
  STOCKTAKE_SCOPE_TRACKING_MODE,
  StockCountResult as StockCountResultSchema,
  StocktakeOverdueResult as StocktakeOverdueResultSchema,
  StocktakeScope as StocktakeScopeSchema,
  StocktakeSessionListResult as StocktakeSessionListResultSchema,
  StocktakeSessionReport as StocktakeSessionReportSchema,
  StocktakeSession as StocktakeSessionSchema,
  StocktakeUncountedResult as StocktakeUncountedResultSchema,
  unitClassFor,
} from '@pkg/schema';
import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  type SQL,
  sql,
} from 'drizzle-orm';

import { createOrgWorkingCalendar, listWorkingCalendarOffDays } from '../jobs/working-calendar-service.js';
import { bucketKey, insertMovement, loadBucketQuantities, loadStockPart, toLedgerQuantity } from './ledger.js';
import { resolveMovementActor } from './movement-actor.js';
import { groupBy, sumBy, sumNullableBy } from './row-grouping.js';
import {
  StocktakePartOutOfScopeError,
  StocktakeSessionAlreadyOpenError,
  StocktakeSessionClosedError,
  StocktakeSessionNotFoundError,
  StocktakeUncountedBucketError,
} from './stocktake-errors.js';
import { assertDeltaMatchesUnitClass, assertLengthMatchesUnitClass } from './unit-class-rules.js';

const closedByUser = aliasedTable(user, 'stocktake_closed_by_user');
const openedByUser = aliasedTable(user, 'stocktake_opened_by_user');

export async function openStocktakeSession({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: OpenStocktakeSessionInput;
}): Promise<StocktakeSession> {
  return db.transaction(async (tx) => {
    const openerUserId = await resolveMovementActor({
      assertedActorUserId: input.actorUserId,
      db: tx,
      sessionUserId: actorUserId,
    });

    // The partial unique index on the open session per scope is the whole latch: one open walk per
    // rhythm, enforced by the database rather than by a read that a concurrent opener could clear.
    // Every already-open case therefore arrives here as a constraint violation, and every one of
    // them is translated into the sentence telling someone to resume the walk in progress — a
    // storeman tapping twice and the loser of a genuine race read the same refusal, never an
    // internal error.
    const [row] = await tx
      .insert(stocktakeSessions)
      .values({ openedByUserId: openerUserId, scope: input.scope })
      .returning({ id: stocktakeSessions.id })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new StocktakeSessionAlreadyOpenError(input.scope);
        throw error;
      });
    if (!row) throw new Error('Stocktake session insert did not return a row');

    return loadSession({ db: tx, sessionId: row.id });
  });
}

/**
 * Ends the walk. The skip list the close is meant to surface is not computed here — it is the same
 * query the count screen has been showing all along (`getStocktakeSession().uncounted`), read before
 * the close so nobody confirms a close against a list the server never showed them.
 */
export async function closeStocktakeSession({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: CloseStocktakeSessionInput;
}): Promise<StocktakeSession> {
  return db.transaction(async (tx) => {
    const closerUserId = await resolveMovementActor({
      assertedActorUserId: input.actorUserId,
      db: tx,
      sessionUserId: actorUserId,
    });
    const session = await lockSession(tx, input.sessionId);

    if (session.closedAt !== null) throw new StocktakeSessionClosedError(input.sessionId);

    await tx
      .update(stocktakeSessions)
      .set({ closedAt: new Date(), closedByUserId: closerUserId })
      .where(eq(stocktakeSessions.id, input.sessionId));

    return loadSession({ db: tx, sessionId: input.sessionId });
  });
}

/**
 * One Part counted, posted as `stock-count` delta adjustments through the ordinary ledger path.
 *
 * The delta is computed **here, under the Part's write lock** rather than sent by the tablet, which
 * is what stops a mid-session receipt from being counted away: whatever arrived between the walk
 * reaching this bin and this post landing is already in `expected`, so the correction is measured
 * against the shelf as the ledger knows it at this instant (spec §9). Never an overwrite.
 *
 * A count covers the whole Part, so every bucket the ledger holds stock in has to be named — an
 * empty one by keying zero. The count says it, the server never infers it, and a Part still holding
 * an unnamed bucket is refused: an inferred zero is indistinguishable from stock that arrived while
 * the screen was open, and writing that off is the one mistake a stocktake must not make.
 *
 * Every counted bucket appends a row, **including the ones that agreed**. A zero-delta row is what
 * records "counted, and it matched" — the sessions hold no per-Part counted flag, so the movement
 * is the only place that fact can live, and without it a perfect count would read as a skip.
 */
export async function postStockCount({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PostStockCountInput;
}): Promise<StockCountResult> {
  return db.transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    if (session.closedAt !== null) throw new StocktakeSessionClosedError(input.sessionId);

    const part = await loadStockPart({ db: tx, lockForMovement: true, partId: input.partId });
    const counterUserId = await resolveMovementActor({
      assertedActorUserId: input.actorUserId,
      db: tx,
      sessionUserId: actorUserId,
    });
    const unitClass = unitClassFor(part.unitOfMeasure);

    if (part.stockTrackingMode !== STOCKTAKE_SCOPE_TRACKING_MODE[session.scope]) {
      throw new StocktakePartOutOfScopeError(input.partId, session.scope);
    }

    for (const bucket of input.buckets) {
      assertDeltaMatchesUnitClass(bucket.observed, unitClass);
      assertLengthMatchesUnitClass(bucket.lengthMm, unitClass);
    }

    const onHandByLength: ReadonlyMap<number | null, number> =
      (await loadBucketQuantities(tx, [input.partId])).get(input.partId) ?? new Map();
    const observedLengths = new Set(input.buckets.map((bucket) => bucket.lengthMm));
    const unnamed = [...onHandByLength]
      .filter(([lengthMm, quantity]) => quantity !== 0 && !observedLengths.has(lengthMm))
      .map(([lengthMm]) => lengthMm);

    // A count covers the whole Part, so every stocked bucket must be accounted for — but the count
    // has to *say* it found one empty rather than have the server infer it. Inferring is what turns
    // a receipt that landed between the screen loading and the count posting into a silent
    // write-off of stock nobody looked at: the counter never saw that bucket, so they never counted
    // it, and zeroing it on their behalf destroys the arrival. Refusing sends them back to the rack.
    if (unnamed.length > 0) throw new StocktakeUncountedBucketError(input.partId, unnamed);

    const buckets: StockCountBucketVariance[] = input.buckets.map((bucket) => {
      const expected = onHandByLength.get(bucket.lengthMm) ?? 0;

      return {
        delta: toLedgerQuantity(bucket.observed - expected),
        expected,
        lengthMm: bucket.lengthMm,
        observed: bucket.observed,
      };
    });

    const movements = [];

    for (const bucket of buckets) {
      movements.push(
        await insertMovement(tx, {
          actorUserId: counterUserId,
          delta: bucket.delta,
          lengthMm: bucket.lengthMm,
          movementType: 'adjustment',
          partId: input.partId,
          reason: 'stock-count',
          stocktakeSessionId: input.sessionId,
        }),
      );
    }

    return StockCountResultSchema.parse({ buckets, movements, partId: input.partId, sessionId: input.sessionId });
  });
}

export async function listStocktakeSessions({ db }: { db: Db }): Promise<StocktakeSessionListResult> {
  const rows = await sessionQuery(db).orderBy(desc(stocktakeSessions.openedAt), desc(stocktakeSessions.id));

  return StocktakeSessionListResultSchema.parse({ items: rows });
}

/** One session's own facts, and nothing that costs a ledger replay to produce. */
export async function getStocktakeSession({ db, sessionId }: { db: Db; sessionId: UUID }): Promise<StocktakeSession> {
  return loadSession({ db, sessionId });
}

/**
 * One session as its report: every counted Part with its variance, and the priced total for a cost
 * reader (spec §9's session variance report).
 *
 * Observed and expected are **replayed from the ledger** rather than stored beside the delta. The
 * running balance in a bucket immediately after a count row is by definition what was counted, and
 * that number minus the row's delta is what the shelf was believed to hold — so the ledger stays the
 * single record, and a second copy of the same fact can never disagree with it.
 *
 * That replay is why this read is deliberately *not* what the tablet asks between counts: it loads
 * every movement of every Part the session has touched, which by the end of a stores walk is most
 * of the ledger. The tablet takes the cheap session header and the paged uncounted list instead;
 * this is a desk-side report, read once.
 */
export async function getStocktakeSessionReport({
  db,
  sessionId,
}: {
  db: Db;
  sessionId: UUID;
}): Promise<StocktakeSessionReport> {
  // The session's counts and the ledger they are replayed against are one report fact; a count
  // posted between the two reads must not split their snapshots.
  return db.transaction((tx) => readStocktakeSessionReport(tx, sessionId), {
    accessMode: 'read only',
    isolationLevel: 'repeatable read',
  });
}

async function readStocktakeSessionReport(db: DatabaseTransaction, sessionId: UUID): Promise<StocktakeSessionReport> {
  const session = await loadSession({ db, sessionId });
  const countRows = await db
    .select({
      actorName: user.name,
      actorUserId: stockMovements.actorUserId,
      createdAt: stockMovements.createdAt,
      id: stockMovements.id,
      partCode: parts.code,
      partId: stockMovements.partId,
      partName: parts.name,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(stockMovements)
    .innerJoin(parts, eq(parts.id, stockMovements.partId))
    .innerJoin(user, eq(user.id, stockMovements.actorUserId))
    .where(eq(stockMovements.stocktakeSessionId, sessionId))
    .orderBy(asc(parts.code), asc(stockMovements.createdAt), asc(stockMovements.id));

  const countedPartIds = [...new Set(countRows.map((row) => row.partId))];
  const ledgerRows =
    countedPartIds.length === 0
      ? []
      : await db
          .select({
            delta: stockMovements.delta,
            id: stockMovements.id,
            lengthMm: stockMovements.lengthMm,
            movementType: stockMovements.movementType,
            partId: stockMovements.partId,
            reason: stockMovements.reason,
            stocktakeSessionId: stockMovements.stocktakeSessionId,
            unitCost: stockMovements.unitCost,
          })
          .from(stockMovements)
          .where(inArray(stockMovements.partId, countedPartIds))
          .orderBy(asc(stockMovements.partId), asc(stockMovements.createdAt), asc(stockMovements.id));

  const varianceByMovement = deriveSessionVariances(ledgerRows, sessionId);
  // One row per *posting*, not per Part. Counting the same Part twice in a session is legal and
  // documented — the second count corrects against what the first left behind — and rolling both
  // into one row would credit the whole net variance to whoever happened to go first. Every row of
  // one post shares its transaction's timestamp and actor, which is what makes this grouping exact.
  const counts = [
    ...groupBy(countRows, (row) => `${row.partId}:${row.createdAt.toISOString()}:${row.actorUserId}`).values(),
  ].map(([head, ...tail]) => {
    const buckets = [head, ...tail].map((row) => {
      const variance = varianceByMovement.get(row.id);
      // Both reads share one snapshot and the replay covers every movement of every counted Part,
      // so this cannot happen; it is asserted rather than defaulted so a reporting zero can never
      // stand in for a variance that was never computed.
      if (!variance) throw new Error(`Stocktake count ${row.id} is missing from its Part's ledger replay`);

      return variance;
    });

    return {
      buckets: buckets.map((bucket) => ({
        delta: bucket.delta,
        expected: bucket.expected,
        lengthMm: bucket.lengthMm,
        observed: bucket.observed,
      })),
      countedAt: head.createdAt,
      countedByName: head.actorName,
      delta: toLedgerQuantity(sumBy(buckets, (bucket) => bucket.delta)),
      partCode: head.partCode,
      partId: head.partId,
      partName: head.partName,
      unitOfMeasure: head.unitOfMeasure,
      varianceValue: sumNullableBy(buckets, (bucket) => bucket.value),
    };
  });
  const rawMaterialDrift = await readRawMaterialDrift({ counts, db, session });

  return StocktakeSessionReportSchema.parse({
    counts,
    rawMaterialDrift,
    session,
    totalVarianceValue: sumNullableBy(counts, (count) => count.varianceValue),
  });
}

async function readRawMaterialDrift({
  counts,
  db,
  session,
}: {
  counts: Array<Pick<StocktakeSessionCount, 'delta' | 'partCode' | 'partId' | 'partName' | 'unitOfMeasure'>>;
  db: DatabaseTransaction;
  session: StocktakeSession;
}): Promise<RawMaterialDriftReport | null> {
  if (session.scope !== 'raw-material' || session.closedAt === null) return null;

  const currentClosedAt = new Date(session.closedAt);
  const [previous] = await db
    .select({ closedAt: stocktakeSessions.closedAt, id: stocktakeSessions.id })
    .from(stocktakeSessions)
    .where(
      and(
        eq(stocktakeSessions.scope, 'raw-material'),
        isNotNull(stocktakeSessions.closedAt),
        ne(stocktakeSessions.id, session.id),
        lt(stocktakeSessions.closedAt, currentClosedAt),
      ),
    )
    .orderBy(desc(stocktakeSessions.closedAt), desc(stocktakeSessions.id))
    .limit(1);
  if (!previous?.closedAt) return null;

  const fromCompletedOnExclusive = toPlantDateOnly(previous.closedAt);
  const throughCompletedOn = toPlantDateOnly(currentClosedAt);
  const [previousCountRows, estimateRows] = await Promise.all([
    db
      .selectDistinct({ partId: stockMovements.partId })
      .from(stockMovements)
      .where(eq(stockMovements.stocktakeSessionId, previous.id)),
    db
      .select({ payload: jobEstimateSnapshots.payload })
      .from(jobEstimateSnapshots)
      .innerJoin(jobs, eq(jobs.id, jobEstimateSnapshots.jobId))
      .where(
        and(
          isNull(jobs.cancelledAt),
          isNotNull(jobs.completedOn),
          gt(jobs.completedOn, fromCompletedOnExclusive),
          lte(jobs.completedOn, throughCompletedOn),
        ),
      ),
  ]);
  const previouslyCountedPartIds = new Set(previousCountRows.map((row) => row.partId));
  // Job snapshots are the only revision-stable record of what that Job was expected to consume.
  // Rework snapshots intentionally carry no Product-level material, so they cannot inflate this floor.
  const expectedByPartId = new Map<
    UUID,
    {
      expectedConsumptionFloor: number;
      partCode: string;
      partId: UUID;
      partName: string;
      unitOfMeasure: StocktakeSessionCount['unitOfMeasure'];
    }
  >();
  for (const { payload } of estimateRows) {
    for (const line of payload.materialLines) {
      const current = expectedByPartId.get(line.partId);
      expectedByPartId.set(line.partId, {
        expectedConsumptionFloor: (current?.expectedConsumptionFloor ?? 0) + line.quantityPerUnit,
        partCode: line.partCode,
        partId: line.partId,
        partName: line.partName,
        unitOfMeasure: line.unitOfMeasure,
      });
    }
  }
  const expectedRows = [...expectedByPartId.values()];
  const actualByPartId = new Map(
    [...groupBy(counts, (count) => count.partId)].map(([partId, partCounts]) => [
      partId,
      -sumBy(partCounts, (count) => count.delta),
    ]),
  );
  const factsByPartId = new Map(
    [...expectedRows, ...counts].map((row) => [
      row.partId,
      {
        partCode: row.partCode,
        partId: row.partId,
        partName: row.partName,
        unitOfMeasure: row.unitOfMeasure,
      },
    ]),
  );
  const items = [...factsByPartId.values()]
    .map((part) => {
      const actualConsumption = previouslyCountedPartIds.has(part.partId)
        ? (actualByPartId.get(part.partId) ?? null)
        : null;
      const expectedConsumptionFloor = expectedByPartId.get(part.partId)?.expectedConsumptionFloor ?? 0;

      return {
        actualConsumption,
        driftFromExpectedFloor: actualConsumption === null ? null : actualConsumption - expectedConsumptionFloor,
        expectedConsumptionFloor,
        ...part,
      };
    })
    .toSorted((left, right) => left.partCode.localeCompare(right.partCode));

  return {
    fromCompletedOnExclusive,
    fromSessionId: previous.id,
    isFloor: true,
    items,
    throughCompletedOn,
    toSessionId: session.id,
  };
}

/**
 * Whether each standing rhythm is behind (spec §12). Both scopes are always returned, on time or
 * not: a signal that vanishes when it is healthy cannot tell "counted last Tuesday" from "nobody
 * has looked at this screen in a month".
 */
export async function listStocktakeOverdue({
  clock = () => new Date(),
  db,
}: {
  clock?: () => Date;
  db: Db;
}): Promise<StocktakeOverdueResult> {
  const [lastClosedRows, offDays] = await Promise.all([
    db
      .select({ closedAt: sql<Date>`max(${stocktakeSessions.closedAt})`, scope: stocktakeSessions.scope })
      .from(stocktakeSessions)
      .where(isNotNull(stocktakeSessions.closedAt))
      .groupBy(stocktakeSessions.scope),
    listWorkingCalendarOffDays(db),
  ]);

  const lastClosedByScope = new Map(lastClosedRows.map((row) => [row.scope, row.closedAt]));
  const workingCalendar = createOrgWorkingCalendar(offDays);
  const today = toPlantDateOnly(clock());

  return StocktakeOverdueResultSchema.parse({
    items: StocktakeScopeSchema.options.map((scope) => {
      const closedAt = lastClosedByScope.get(scope);

      return deriveStocktakeOverdue({
        lastClosedOn: closedAt ? toPlantDateOnly(new Date(closedAt)) : null,
        scope,
        today,
        workingCalendar,
      });
    }),
  });
}

/**
 * The session's to-do while it is open, and its skip list once it closes — the same query, read at
 * two moments. Nothing about it is stored: membership follows the Part's Stock Tracking Mode, so a
 * Part re-classified mid-session simply belongs to the other walk from then on.
 *
 * Paged, because the list starts as long as the scope. A stores walk covers every perpetual Part
 * the plant stocks and the tablet re-reads what is left after every single count, so an unpaged
 * read here would ship the whole catalogue down a shared device dozens of times an hour.
 *
 * "Not counted" is a `NOT EXISTS` against the session's own movements rather than an id list the
 * caller assembles: by the end of a walk that list *is* the catalogue, and passing it back into the
 * query as a literal would grow the request with every count posted.
 */
export async function listStocktakeUncounted({
  db,
  input,
}: {
  db: Db;
  input: StocktakeUncountedInput;
}): Promise<StocktakeUncountedResult> {
  const session = await loadSession({ db, sessionId: input.sessionId });
  const where = and(
    eq(parts.stockTrackingMode, STOCKTAKE_SCOPE_TRACKING_MODE[session.scope]),
    isUncountedInSession(input.sessionId),
  );
  const page = db
    .select({
      partCode: parts.code,
      partId: parts.id,
      partName: parts.name,
      // A revaluation moves cost and never quantity, so it must not reach a stock-on-hand sum.
      quantity: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::double precision`,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(parts)
    .leftJoin(stockMovements, and(eq(stockMovements.partId, parts.id), ne(stockMovements.movementType, 'revaluation')))
    .where(where)
    .groupBy(parts.id, parts.code, parts.name, parts.unitOfMeasure)
    .orderBy(asc(parts.code), asc(parts.id))
    .$dynamic();

  const [rows, total] = await Promise.all([withPagination(page, input), db.$count(parts, where)]);

  return StocktakeUncountedResultSchema.parse({
    items: rows,
    nextCursor: getNextCursor({ count: rows.length, cursor: input.cursor, total }),
    total,
  });
}

/** Aliased: callers already have `stock_movement` joined in for the stock-on-hand sum. */
function isUncountedInSession(sessionId: UUID): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${stockMovements} AS session_count
    WHERE session_count.stocktake_session_id = ${sessionId}
      AND session_count.part_id = ${parts.id}
  )`;
}

type SessionVariance = StockCountBucketVariance & { value: number | null };

type LedgerReplayRow = MovingAverageMovement & { id: string; partId: string; stocktakeSessionId: string | null };

/**
 * Replays each counted Part's ledger once, producing every session row's observed, expected and
 * priced worth. The price is the average **at the moment of the count**, taken off the same timeline
 * the movement history reads, so a later receipt cannot reprice a correction that already happened.
 */
function deriveSessionVariances(
  ledgerRows: readonly LedgerReplayRow[],
  sessionId: string,
): Map<string, SessionVariance> {
  const variances = new Map<string, SessionVariance>();

  for (const rows of groupBy(ledgerRows, (row) => row.partId).values()) {
    const timeline = deriveMovingAverageTimeline(rows);
    const balances = new Map<string, number>();

    for (const [index, row] of rows.entries()) {
      // A revaluation carries no quantity, so it opens no bucket and moves no running balance.
      if (row.movementType === 'revaluation') continue;

      const key = bucketKey(row.partId, row.lengthMm);
      const observed = toLedgerQuantity((balances.get(key) ?? 0) + row.delta);
      balances.set(key, observed);

      if (row.stocktakeSessionId !== sessionId) continue;

      variances.set(row.id, {
        delta: row.delta,
        expected: toLedgerQuantity(observed - row.delta),
        lengthMm: row.lengthMm,
        observed,
        value: valueStockMovement({
          averageUnitCost: timeline[index] ?? null,
          delta: row.delta,
          lengthMm: row.lengthMm,
          unitCost: null,
        }),
      });
    }
  }

  return variances;
}

async function lockSession(db: DatabaseTransaction, sessionId: UUID) {
  const [session] = await db
    .select({ closedAt: stocktakeSessions.closedAt, id: stocktakeSessions.id, scope: stocktakeSessions.scope })
    .from(stocktakeSessions)
    .where(eq(stocktakeSessions.id, sessionId))
    .limit(1)
    .for('update');
  if (!session) throw new StocktakeSessionNotFoundError(sessionId);

  return session;
}

async function loadSession({ db, sessionId }: { db: DatabaseTransaction | Db; sessionId: UUID }) {
  const [row] = await sessionQuery(db).where(eq(stocktakeSessions.id, sessionId)).limit(1);
  if (!row) throw new StocktakeSessionNotFoundError(sessionId);

  return StocktakeSessionSchema.parse(row);
}

/** One projection of a session everywhere, so the list row and the detail header cannot diverge. */
function sessionQuery(db: DatabaseTransaction | Db) {
  return db
    .select({
      closedAt: stocktakeSessions.closedAt,
      closedByName: closedByUser.name,
      closedByUserId: stocktakeSessions.closedByUserId,
      countedPartCount: sql<number>`(
        SELECT count(DISTINCT ${stockMovements.partId})::int FROM ${stockMovements}
        WHERE ${stockMovements.stocktakeSessionId} = ${stocktakeSessions.id}
      )`,
      id: stocktakeSessions.id,
      openedAt: stocktakeSessions.openedAt,
      openedByName: openedByUser.name,
      openedByUserId: stocktakeSessions.openedByUserId,
      scope: stocktakeSessions.scope,
    })
    .from(stocktakeSessions)
    .innerJoin(openedByUser, eq(openedByUser.id, stocktakeSessions.openedByUserId))
    .leftJoin(closedByUser, eq(closedByUser.id, stocktakeSessions.closedByUserId));
}
