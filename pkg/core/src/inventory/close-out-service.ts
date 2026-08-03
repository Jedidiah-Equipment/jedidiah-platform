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
  JobCloseOut as JobCloseOutSchema,
  JobStockMovementType,
} from '@pkg/schema';
import { type AnyColumn, and, asc, eq, inArray, isNotNull, isNull, type SQL, sql } from 'drizzle-orm';

import { jobDisplayNameOf, jobDisplaySelection } from '../jobs/job-display.js';
import { lockMutableJob } from '../jobs/job-mutation-guards.js';
import { JobAlreadyClosedOutError, JobNotCompletedError } from './close-out-errors.js';

/** The one compile-checked list of Job-attributed movement types; net drawn must read them all. */
const JOB_MOVEMENT_TYPES = JobStockMovementType.options;

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

    if (job.completedOn === null) throw new JobNotCompletedError(input.jobId);
    if ((await getJobCloseOutAt({ db: tx, jobId: input.jobId })) !== null) {
      throw new JobAlreadyClosedOutError(input.jobId);
    }

    const [row] = await tx
      .insert(jobStockCloseOuts)
      .values({ actorUserId, jobId: input.jobId, note: input.note })
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
      .where(and(closeOutCandidateCondition(), inArray(stockMovements.movementType, JOB_MOVEMENT_TYPES)))
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

/** One condition for all three reads, so an aggregate can never cover a different set than the list. */
function closeOutCandidateCondition() {
  return and(isNotNull(jobs.completedOn), isNull(jobs.cancelledAt), jobIsNotClosedOut(jobs.id));
}
