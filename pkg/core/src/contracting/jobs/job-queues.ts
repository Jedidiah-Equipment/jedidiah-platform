import { createGlobalSearchCondition, type Db, getSortOrder, withPagination } from '@pkg/db';
import { contractingCustomers, contractingFarms, contractingJobs, contractingWorkTypes } from '@pkg/db/contracting';
import { JOHANNESBURG_TIME_ZONE } from '@pkg/domain';
import {
  countedAssignmentAttentionLevel,
  formatJobNumber,
  JOB_NUMBER_DIGITS,
  JOB_NUMBER_PREFIX,
  type JobActor,
  jobAssignmentAttentionCounts,
  jobQueueOf,
  jobQueueStatus,
  jobReadSeesMoney,
} from '@pkg/domain/contracting';
import { getNextCursor } from '@pkg/schema';
import {
  type JobListInput,
  type JobListResult,
  type JobQueue,
  JobQueueCounts,
  JobSummary,
  jobQueues,
} from '@pkg/schema/contracting';
import { and, asc, count, eq, not, or, type SQL, sql } from 'drizzle-orm';
import { foreman, invoicer, jobHeader } from './job-load.js';
import { assertReadableStatus, readableBy, readerFor } from './job-readers.js';
import * as jobSql from './job-sql.js';

export async function countJobQueues({ db, actor }: { db: Db; actor: JobActor }) {
  const reader = readerFor(actor);
  const rows = await db
    .select({
      status: contractingJobs.status,
      looksFinished: jobSql.looksFinished,
      count: sql<number>`count(*)::integer`,
    })
    .from(contractingJobs)
    .where(readableBy(reader))
    .groupBy(contractingJobs.status, jobSql.looksFinished);
  const counts = Object.fromEntries(jobQueues.map((queue) => [queue, 0])) as Record<JobQueue, number>;
  for (const row of rows) counts[jobQueueOf(row)] += row.count;
  return JobQueueCounts.parse(counts);
}

/** The loudest Machine Assignment attention needing a look across the Active Jobs this person reads. */
export async function activeJobAttentionLevel({ db, actor }: { db: Db; actor: JobActor }) {
  const reader = readerFor(actor);
  const [totals] = await db
    .select({
      openGapFlags: sql<number>`coalesce(sum(${jobSql.openGapFlags}), 0)::integer`,
      critical: sql<number>`coalesce(sum(${jobSql.readingsNeedingALookAt('critical')}), 0)::integer`,
      warning: sql<number>`coalesce(sum(${jobSql.readingsNeedingALookAt('warning')}), 0)::integer`,
    })
    .from(contractingJobs)
    .where(and(inQueue('active'), readableBy(reader)));
  if (!totals) return null;
  const { openGapFlags, ...readings } = totals;
  return countedAssignmentAttentionLevel(jobAssignmentAttentionCounts(openGapFlags, readings));
}

/** The South African calendar day a Job was invoiced on. */
const invoicedDay = sql`(${contractingJobs.invoicedAt} at time zone ${JOHANNESBURG_TIME_ZONE})::date`;

/** Looks finished is carved out of Active, so each Job matches exactly one queue. */
function inQueue(queue: JobQueue): SQL | undefined {
  const status = eq(contractingJobs.status, jobQueueStatus[queue]);
  if (queue === 'active') return and(status, not(jobSql.looksFinished));
  if (queue === 'looks-finished') return and(status, jobSql.looksFinished);
  return status;
}

/** SQL twin of domain `formatJobNumber`, so a search for the Job Number finds the Job. */
// lpad truncates a longer value, so the width grows with the code as padStart does.
const jobNumberText = sql`${JOB_NUMBER_PREFIX} || lpad(${contractingJobs.code}::text, greatest(${JOB_NUMBER_DIGITS}, length(${contractingJobs.code}::text)), '0')`;

export async function listJobs({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  /** `invoicedFrom`/`invoicedTo` keep only Jobs invoiced on those South African calendar days. */
  input: JobListInput;
}): Promise<JobListResult> {
  const reader = readerFor(actor);
  for (const queue of input.queues) assertReadableStatus(jobQueueStatus[queue], reader);
  const where = and(
    or(...input.queues.map(inQueue)),
    input.invoicedFrom ? sql`${invoicedDay} >= ${input.invoicedFrom}::date` : undefined,
    input.invoicedTo ? sql`${invoicedDay} <= ${input.invoicedTo}::date` : undefined,
    readableBy(reader),
    createGlobalSearchCondition(input.search, [
      jobNumberText,
      sql`${contractingCustomers.name}`,
      sql`${contractingFarms.name}`,
      sql`${contractingWorkTypes.name}`,
      sql`${foreman.name}`,
      sql`${contractingJobs.description}`,
      sql`${contractingJobs.invoiceNumber}`,
    ]),
  );
  const query = db
    .select({
      ...jobHeader,
      plannedStints: jobSql.stintCount('planned'),
      onSiteStints: jobSql.stintCount('on-site'),
      leftStints: jobSql.stintCount('left'),
      looksFinished: jobSql.looksFinished,
      openGapFlags: jobSql.openGapFlags,
      readings: {
        critical: jobSql.readingsNeedingALookAt('critical'),
        warning: jobSql.readingsNeedingALookAt('warning'),
      },
    })
    .from(contractingJobs)
    .innerJoin(contractingCustomers, eq(contractingCustomers.id, contractingJobs.customerId))
    .innerJoin(
      contractingFarms,
      and(eq(contractingFarms.id, contractingJobs.farmId), eq(contractingFarms.customerId, contractingJobs.customerId)),
    )
    .innerJoin(contractingWorkTypes, eq(contractingWorkTypes.id, contractingJobs.workTypeId))
    .leftJoin(foreman, eq(foreman.id, contractingJobs.foremanUserId))
    .leftJoin(invoicer, eq(invoicer.id, contractingJobs.invoicedByUserId))
    .where(where)
    .orderBy(
      ...(input.sortBy === 'invoicedAt'
        ? [sql`${contractingJobs.invoicedAt} ${sql.raw(input.sortDirection)} nulls last`]
        : []),
      getSortOrder(contractingJobs.code, input.sortDirection),
      asc(contractingJobs.id),
    )
    .$dynamic();
  const [rows, [totalRow]] = await Promise.all([
    withPagination(query, input),
    db
      .select({ total: count() })
      .from(contractingJobs)
      .innerJoin(contractingCustomers, eq(contractingCustomers.id, contractingJobs.customerId))
      .innerJoin(
        contractingFarms,
        and(
          eq(contractingFarms.id, contractingJobs.farmId),
          eq(contractingFarms.customerId, contractingJobs.customerId),
        ),
      )
      .innerJoin(contractingWorkTypes, eq(contractingWorkTypes.id, contractingJobs.workTypeId))
      .leftJoin(foreman, eq(foreman.id, contractingJobs.foremanUserId))
      .where(where),
  ]);
  const total = totalRow?.total ?? 0;
  const seesMoney = jobReadSeesMoney(reader.mode);
  const items = rows.map(({ job, readings, ...row }) =>
    JobSummary.parse({
      ...job,
      ...row,
      assignmentAttention: jobAssignmentAttentionCounts(row.openGapFlags, readings),
      jobNumber: formatJobNumber(job.code),
      pricedTotal: seesMoney ? job.pricedTotal : null,
      pricedAt: job.pricedAt?.toISOString() ?? null,
      invoicedAt: job.invoicedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    }),
  );
  return { items, nextCursor: getNextCursor({ count: items.length, cursor: input.cursor, total }), total };
}
