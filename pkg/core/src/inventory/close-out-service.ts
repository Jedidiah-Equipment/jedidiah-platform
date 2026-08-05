import {
  type DatabaseTransaction,
  type Db,
  jobCfoAssemblies,
  jobCfoParts,
  jobStockCloseOuts,
  jobs,
  products,
  productUnits,
  quotes,
  stockMovements,
} from '@pkg/db';
import { deriveCloseOutAge, deriveCommitment, toPlantDateOnly } from '@pkg/domain';
import type { AuthId, CloseOutJobInput, CloseOutQueueResult, JobCloseOut, UUID } from '@pkg/schema';
import {
  CloseOutQueueResult as CloseOutQueueResultSchema,
  DateOnlyIso,
  JOB_STOCK_MOVEMENT_TYPES,
  JobCloseOut as JobCloseOutSchema,
} from '@pkg/schema';
import { type AnyColumn, and, asc, eq, inArray, isNotNull, isNull, type SQL, sql } from 'drizzle-orm';

import { jobDisplayNameOf, jobDisplaySelection } from '../jobs/job-display.js';
import { lockMutableJob } from '../jobs/job-mutation-guards.js';
import { JobAlreadyClosedOutError, JobNotCompletedError } from './close-out-errors.js';
import { resolveMovementActor } from './movement-actor.js';

/**
 * Ends a Job's stock life in one insert. Leftovers are returned first through the ordinary
 * return-to-store path — only the close itself has to be a transaction, and the Job row lock is
 * what stops two closers racing past the primary key.
 */
export async function closeOutJob({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: CloseOutJobInput;
}): Promise<JobCloseOut> {
  return db.transaction(async (tx) => {
    // Cancellation already released this Job's commitment and is a different exit from the queue;
    // closing one out would assert a stock life that ended some other way.
    const job = await lockMutableJob(tx, input.jobId);
    const closerUserId = await resolveMovementActor({
      assertedActorUserId: input.actorUserId,
      db: tx,
      sessionUserId: actorUserId,
    });

    if (job.completedOn === null) throw new JobNotCompletedError(input.jobId);
    if ((await getJobCloseOutAt({ db: tx, jobId: input.jobId })) !== null) {
      throw new JobAlreadyClosedOutError(input.jobId);
    }

    const [row] = await tx
      .insert(jobStockCloseOuts)
      .values({ actorUserId: closerUserId, jobId: input.jobId, note: input.note })
      .returning();
    if (!row) throw new Error('Job close-out insert did not return a row');

    return JobCloseOutSchema.parse({
      actorUserId: row.actorUserId,
      closedOutAt: row.createdAt,
      jobId: row.jobId,
      note: row.note,
    });
  });
}

export async function getJobCloseOutAt({
  db,
  jobId,
}: {
  db: DatabaseTransaction | Db;
  jobId: UUID;
}): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: jobStockCloseOuts.createdAt })
    .from(jobStockCloseOuts)
    .where(eq(jobStockCloseOuts.jobId, jobId));

  return row?.createdAt ?? null;
}

/** The condition every commitment sum carries: a closed-out Job contributes nothing, ever again. */
export function jobIsNotClosedOut(jobIdColumn: AnyColumn): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${jobStockCloseOuts} WHERE ${jobStockCloseOuts.jobId} = ${jobIdColumn}
  )`;
}

/**
 * Completed Jobs whose stock life has not ended: something is still drawn, or commitment is still
 * open, or both. A Job leaves only by being closed out — the age column is the stale backstop.
 *
 * Outstanding stock is counted in **Parts**, never summed: a Job's leftovers span discrete, linear,
 * and measured Parts, and one figure spanning three unit classes would mean nothing.
 */
export async function listCloseOutQueue({
  clock = () => new Date(),
  db,
}: {
  clock?: () => Date;
  db: Db;
}): Promise<CloseOutQueueResult> {
  const [candidates, cfoRows, drawnRows] = await Promise.all([
    db
      .select({ ...jobDisplaySelection, completedOn: jobs.completedOn, id: jobs.id })
      .from(jobs)
      .leftJoin(productUnits, eq(productUnits.id, jobs.productUnitId))
      .leftJoin(products, eq(products.id, productUnits.productId))
      .leftJoin(quotes, eq(quotes.id, jobs.quoteId))
      .where(closeOutCandidateCondition())
      // Oldest completion first, so whatever has waited longest — the stale end — leads the queue.
      .orderBy(asc(jobs.completedOn), asc(jobs.code)),
    db
      .select({
        cfoQuantity: sql<number>`sum(${jobCfoParts.quantity})::double precision`,
        jobId: jobCfoAssemblies.jobId,
        partId: jobCfoParts.partId,
      })
      .from(jobCfoAssemblies)
      .innerJoin(jobCfoParts, eq(jobCfoParts.cfoAssemblyId, jobCfoAssemblies.id))
      .innerJoin(jobs, eq(jobs.id, jobCfoAssemblies.jobId))
      .where(closeOutCandidateCondition())
      .groupBy(jobCfoAssemblies.jobId, jobCfoParts.partId),
    db
      .select({
        drawnQuantity: sql<number>`(-sum(${stockMovements.delta}))::double precision`,
        jobId: stockMovements.jobId,
        partId: stockMovements.partId,
      })
      .from(stockMovements)
      .innerJoin(jobs, eq(jobs.id, stockMovements.jobId))
      .where(and(closeOutCandidateCondition(), inArray(stockMovements.movementType, JOB_STOCK_MOVEMENT_TYPES)))
      .groupBy(stockMovements.jobId, stockMovements.partId),
  ]);

  if (candidates.length === 0) return { items: [] };

  const cfoByJobPart = new Map<string, number>(cfoRows.map((row) => [`${row.jobId}:${row.partId}`, row.cfoQuantity]));
  const drawnByJobPart = new Map<string, number>(
    drawnRows.flatMap((row) => (row.jobId ? [[`${row.jobId}:${row.partId}`, row.drawnQuantity] as const] : [])),
  );
  const partIdsByJob = new Map<string, Set<string>>();

  for (const row of [...cfoRows, ...drawnRows]) {
    if (!row.jobId) continue;
    const partIds = partIdsByJob.get(row.jobId) ?? new Set<string>();
    partIds.add(row.partId);
    partIdsByJob.set(row.jobId, partIds);
  }

  const today = toPlantDateOnly(clock());

  return CloseOutQueueResultSchema.parse({
    items: candidates.flatMap((candidate) => {
      let committedPartCount = 0;
      let drawnPartCount = 0;

      for (const partId of partIdsByJob.get(candidate.id) ?? []) {
        const key = `${candidate.id}:${partId}`;
        const drawnQuantity = drawnByJobPart.get(key) ?? 0;

        if (deriveCommitment({ cfoQuantity: cfoByJobPart.get(key) ?? 0, drawnQuantity }) > 0) committedPartCount += 1;
        // Leftovers still held, per Part: an over-returned Part is not stock some other Part owes.
        if (drawnQuantity > 0) drawnPartCount += 1;
      }

      if (committedPartCount === 0 && drawnPartCount === 0) return [];

      return [
        {
          ...deriveCloseOutAge({ completedOn: DateOnlyIso.parse(candidate.completedOn), today }),
          code: candidate.code,
          committedPartCount,
          completedOn: candidate.completedOn,
          displayName: jobDisplayNameOf(candidate),
          drawnPartCount,
          jobId: candidate.id,
        },
      ];
    }),
  });
}

/**
 * One condition for all three reads, so an aggregate can never cover a different set than the list.
 * It predicates on `jobs` directly, so every caller must have that table joined into its query.
 *
 * The stock-activity arm is what keeps the queue bounded. Without it every completed Job the shop
 * has ever finished stays a candidate forever — nothing ever closes out a Job that held no stock —
 * and the reads below grow without limit. A Job that never drew and was never planned for cannot
 * have leftovers or commitment, so excluding it here is exact, not an approximation.
 *
 * The remaining per-Part arithmetic stays in `deriveCommitment`. Expressing it here too would put
 * the same rule in two languages, and the residue it would remove — a Job that drew and returned
 * everything — is the small, human-sized set the queue is meant to be working through anyway.
 *
 * Note for anyone tempted to drop the arm: it is deliberately *output*-invariant. The residue filter
 * in `listCloseOutQueue` already excludes everything this excludes, so no assertion on `items` can
 * tell the two apart — what changes is how many rows the three reads scan to reach that answer.
 */
function closeOutCandidateCondition() {
  return and(isNotNull(jobs.completedOn), isNull(jobs.cancelledAt), jobIsNotClosedOut(jobs.id), hasStockActivity());
}

function hasStockActivity(): SQL {
  const jobMovementTypes = sql.join(
    JOB_STOCK_MOVEMENT_TYPES.map((movementType) => sql`${movementType}`),
    sql`, `,
  );

  // Aliased: callers already have `stock_movement` and the CFO tables in their own FROM clauses.
  return sql`(
    EXISTS (
      SELECT 1 FROM ${stockMovements} AS activity_movement
      WHERE activity_movement.job_id = ${jobs.id}
        AND activity_movement.movement_type IN (${jobMovementTypes})
    ) OR EXISTS (
      SELECT 1 FROM ${jobCfoAssemblies} AS activity_assembly
      JOIN ${jobCfoParts} AS activity_cfo_part ON activity_cfo_part.cfo_assembly_id = activity_assembly.id
      WHERE activity_assembly.job_id = ${jobs.id}
    )
  )`;
}
