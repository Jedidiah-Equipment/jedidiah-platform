import {
  type DatabaseTransaction,
  type Db,
  isUniqueViolation,
  parts,
  stockMovements,
  stocktakeSessions,
  user,
} from '@pkg/db';
import type { MovingAverageMovement } from '@pkg/domain';
import { deriveMovingAverageTimeline, deriveStocktakeOverdue, toPlantDateOnly, valueStockMovement } from '@pkg/domain';
import type {
  AuthId,
  CloseStocktakeSessionInput,
  OpenStocktakeSessionInput,
  PostStockCountInput,
  StockCountBucketVariance,
  StockCountResult,
  StocktakeOverdueResult,
  StocktakeScope,
  StocktakeSession,
  StocktakeSessionDetail,
  StocktakeSessionListResult,
  UUID,
} from '@pkg/schema';
import {
  STOCKTAKE_SCOPE_TRACKING_MODE,
  StockCountResult as StockCountResultSchema,
  StocktakeOverdueResult as StocktakeOverdueResultSchema,
  StocktakeScope as StocktakeScopeSchema,
  StocktakeSessionDetail as StocktakeSessionDetailSchema,
  StocktakeSessionListResult as StocktakeSessionListResultSchema,
  StocktakeSession as StocktakeSessionSchema,
  unitClassFor,
} from '@pkg/schema';
import { aliasedTable, and, asc, desc, eq, inArray, isNotNull, isNull, ne, notInArray, sql } from 'drizzle-orm';

import { createOrgWorkingCalendar, listWorkingCalendarOffDays } from '../jobs/working-calendar-service.js';
import { bucketKey, bucketKeyLengthMm, insertMovement, loadBucketQuantities, loadStockPart } from './ledger.js';
import { resolveMovementActor } from './movement-actor.js';
import { groupBy, sumBy } from './row-grouping.js';
import {
  StocktakePartOutOfScopeError,
  StocktakeSessionAlreadyOpenError,
  StocktakeSessionClosedError,
  StocktakeSessionNotFoundError,
} from './stocktake-errors.js';
import { assertDeltaMatchesUnitClass, assertLengthMatchesUnitClass } from './unit-class-rules.js';

const closedByUser = aliasedTable(user, 'stocktake_closed_by_user');
const openedByUser = aliasedTable(user, 'stocktake_opened_by_user');

/** The ledger stores three decimals, so a computed delta is rounded to what the column can hold. */
function toLedgerQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

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

    // The partial unique index is the real guard against two openers racing; this read is what turns
    // the race the index loses into the sentence that tells someone to resume the walk in progress.
    // The loser of a genuine race never reaches the read's verdict, so its constraint violation is
    // translated into the same refusal — a storeman tapping twice must not get an internal error.
    const [open] = await tx
      .select({ id: stocktakeSessions.id })
      .from(stocktakeSessions)
      .where(and(eq(stocktakeSessions.scope, input.scope), isNull(stocktakeSessions.closedAt)))
      .limit(1);
    if (open) throw new StocktakeSessionAlreadyOpenError(input.scope);

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
 * A count covers the whole Part, so a length bucket the ledger holds stock in that the observation
 * does not name is counted as empty. That asymmetry is deliberate: an unmentioned bucket on a rack
 * somebody just walked means the pieces are gone, not that they were skipped.
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

    const onHand = await loadBucketQuantities(tx, [input.partId]);
    const observedByBucket = new Map(input.buckets.map((bucket) => [bucketKey(input.partId, bucket.lengthMm), bucket]));
    const unmentioned = [...onHand]
      .filter(([key, quantity]) => quantity !== 0 && !observedByBucket.has(key))
      .map(([key]) => ({ lengthMm: bucketKeyLengthMm(key), observed: 0 }));

    const buckets: StockCountBucketVariance[] = [...input.buckets, ...unmentioned].map((bucket) => {
      const expected = onHand.get(bucketKey(input.partId, bucket.lengthMm)) ?? 0;

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

/**
 * One session as its report: every counted Part with its variance, what is still uncounted, and the
 * priced total for a cost reader (spec §9's session variance report).
 *
 * Observed and expected are **replayed from the ledger** rather than stored beside the delta. The
 * running balance in a bucket immediately after a count row is by definition what was counted, and
 * that number minus the row's delta is what the shelf was believed to hold — so the ledger stays the
 * single record, and a second copy of the same fact can never disagree with it.
 */
export async function getStocktakeSession({
  db,
  sessionId,
}: {
  db: Db;
  sessionId: UUID;
}): Promise<StocktakeSessionDetail> {
  const session = await loadSession({ db, sessionId });
  const countRows = await db
    .select({
      actorName: user.name,
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
  const [ledgerRows, uncounted] = await Promise.all([
    countedPartIds.length === 0
      ? Promise.resolve([])
      : db
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
          .orderBy(asc(stockMovements.partId), asc(stockMovements.createdAt), asc(stockMovements.id)),
    listUncountedParts({ countedPartIds, db, scope: session.scope }),
  ]);

  const varianceByMovement = deriveSessionVariances(ledgerRows, sessionId);
  const counts = [...groupBy(countRows, (row) => row.partId).values()].map(([head, ...tail]) => {
    const buckets = [head, ...tail].map((row) => {
      const variance = varianceByMovement.get(row.id);
      // The replay covers every movement of every counted Part, so a session row it did not reach
      // means the two reads saw different ledgers — worth failing loudly rather than reporting zero.
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
      varianceValue: sumValues(buckets.map((bucket) => bucket.value)),
    };
  });

  return StocktakeSessionDetailSchema.parse({
    counts,
    session,
    totalVarianceValue: sumValues(counts.map((count) => count.varianceValue)),
    uncounted,
  });
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
 */
async function listUncountedParts({
  countedPartIds,
  db,
  scope,
}: {
  countedPartIds: readonly string[];
  db: Db;
  scope: StocktakeScope;
}) {
  const rows = await db
    .select({
      partCode: parts.code,
      partId: parts.id,
      partName: parts.name,
      quantity: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::double precision`,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(parts)
    // A revaluation moves cost and never quantity, so it must not reach a stock-on-hand sum.
    .leftJoin(stockMovements, and(eq(stockMovements.partId, parts.id), ne(stockMovements.movementType, 'revaluation')))
    .where(
      and(
        eq(parts.stockTrackingMode, STOCKTAKE_SCOPE_TRACKING_MODE[scope]),
        countedPartIds.length === 0 ? undefined : notInArray(parts.id, [...countedPartIds]),
      ),
    )
    .groupBy(parts.id, parts.code, parts.name, parts.unitOfMeasure)
    .orderBy(asc(parts.code));

  return rows;
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

/** Σ, but a single unpriced member makes the whole total unpriced rather than quietly smaller. */
function sumValues(values: readonly (number | null)[]): number | null {
  return values.reduce<number | null>((total, value) => (total === null || value === null ? null : total + value), 0);
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
