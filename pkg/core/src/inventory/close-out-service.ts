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
import { deriveCloseOutAge, deriveCommitment, getJobDisplayName, toPlantDateOnly } from '@pkg/domain';
import type { AuthId, CloseOutJobInput, CloseOutQueueResult, JobCloseOut, UUID } from '@pkg/schema';
import {
  CloseOutQueueResult as CloseOutQueueResultSchema,
  DateOnlyIso,
  formatJobCode,
  JobCloseOut as JobCloseOutSchema,
} from '@pkg/schema';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import { assertJobIsMutable, lockJob } from '../jobs/job-mutation-guards.js';
import { JobAlreadyClosedOutError, JobNotCompletedError } from './close-out-errors.js';

type CloseOutDatabase = Db | DatabaseTransaction;
const JOB_MOVEMENT_TYPES = ['checkout', 'return-to-store'] as const;

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
    const job = await lockJob(tx, input.jobId);

    // Cancellation already released this Job's commitment and is a different exit from the queue;
    // closing one out would assert a stock life that ended some other way.
    assertJobIsMutable(job);
    if (job.completedOn === null) throw new JobNotCompletedError(input.jobId);
    if (await isJobClosedOut(tx, input.jobId)) throw new JobAlreadyClosedOutError(input.jobId);

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

export async function getJobCloseOutAt({ db, jobId }: { db: CloseOutDatabase; jobId: UUID }): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: jobStockCloseOuts.createdAt })
    .from(jobStockCloseOuts)
    .where(eq(jobStockCloseOuts.jobId, jobId));

  return row?.createdAt ?? null;
}

/** The condition every commitment sum carries: a closed-out Job contributes nothing, ever again. */
export function jobIsNotClosedOut(jobIdColumn: Parameters<typeof eq>[0]) {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${jobStockCloseOuts} WHERE ${jobStockCloseOuts.jobId} = ${jobIdColumn}
  )`;
}

/**
 * Completed Jobs whose stock life has not ended: something is still drawn, or commitment is still
 * open, or both. A Job leaves only by being closed out — the age column is the stale backstop.
 */
export async function listCloseOutQueue({
  clock = () => new Date(),
  db,
}: {
  clock?: () => Date;
  db: Db;
}): Promise<CloseOutQueueResult> {
  const candidates = await db
    .select({
      code: jobs.code,
      completedOn: jobs.completedOn,
      id: jobs.id,
      productName: products.name,
      quoteKind: quotes.kind,
      workTitle: quotes.workTitle,
    })
    .from(jobs)
    .leftJoin(productUnits, eq(productUnits.id, jobs.productUnitId))
    .leftJoin(products, eq(products.id, productUnits.productId))
    .leftJoin(quotes, eq(quotes.id, jobs.quoteId))
    .where(and(isNotNull(jobs.completedOn), isNull(jobs.cancelledAt), jobIsNotClosedOut(jobs.id)))
    // Oldest completion first, so whatever has waited longest — the stale end — leads the queue.
    .orderBy(asc(jobs.completedOn), asc(jobs.code));

  if (candidates.length === 0) return { items: [] };

  const jobIds = candidates.map((candidate) => candidate.id);
  const [cfoRows, drawnRows] = await Promise.all([
    db
      .select({
        cfoQuantity: sql<number>`sum(${jobCfoParts.quantity})::double precision`,
        jobId: jobCfoAssemblies.jobId,
        partId: jobCfoParts.partId,
      })
      .from(jobCfoAssemblies)
      .innerJoin(jobCfoParts, eq(jobCfoParts.cfoAssemblyId, jobCfoAssemblies.id))
      .where(inArray(jobCfoAssemblies.jobId, jobIds))
      .groupBy(jobCfoAssemblies.jobId, jobCfoParts.partId),
    db
      .select({
        drawnQuantity: sql<number>`(-sum(${stockMovements.delta}))::double precision`,
        jobId: stockMovements.jobId,
        partId: stockMovements.partId,
      })
      .from(stockMovements)
      .where(and(inArray(stockMovements.jobId, jobIds), inArray(stockMovements.movementType, [...JOB_MOVEMENT_TYPES])))
      .groupBy(stockMovements.jobId, stockMovements.partId),
  ]);

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
      let committedQuantity = 0;
      let drawnQuantity = 0;

      for (const partId of partIdsByJob.get(candidate.id) ?? []) {
        const key = `${candidate.id}:${partId}`;
        const partDrawn = drawnByJobPart.get(key) ?? 0;

        committedQuantity += deriveCommitment({
          cfoQuantity: cfoByJobPart.get(key) ?? 0,
          drawnQuantity: partDrawn,
        });
        // Leftovers still held, per Part: an over-returned Part is not stock some other Part owes.
        drawnQuantity += Math.max(0, partDrawn);
      }

      if (committedQuantity <= 0 && drawnQuantity <= 0) return [];

      return [
        {
          ...deriveCloseOutAge({ completedOn: DateOnlyIso.parse(candidate.completedOn), today }),
          code: candidate.code,
          committedQuantity,
          completedOn: candidate.completedOn,
          displayName: getJobDisplayName({
            code: formatJobCode(candidate.code),
            productName: candidate.productName,
            quoteKind: candidate.quoteKind,
            workTitle: candidate.workTitle,
          }),
          drawnQuantity,
          jobId: candidate.id,
        },
      ];
    }),
  });
}

async function isJobClosedOut(tx: DatabaseTransaction, jobId: UUID): Promise<boolean> {
  const [row] = await tx
    .select({ jobId: jobStockCloseOuts.jobId })
    .from(jobStockCloseOuts)
    .where(eq(jobStockCloseOuts.jobId, jobId));

  return row !== undefined;
}
