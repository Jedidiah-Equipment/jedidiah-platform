import { createGlobalSearchCondition, type Db, getSortOrder, withPagination } from '@pkg/db';
import { contractingCustomers, contractingFarms, contractingJobs, contractingWorkTypes } from '@pkg/db/contracting';
import { JOHANNESBURG_TIME_ZONE } from '@pkg/domain';
import {
  countedAssignmentAttentionLevel,
  formatJobNumber,
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
  JobQueueSummary,
  JobSummary,
  jobQueues,
} from '@pkg/schema/contracting';
import { and, asc, eq, not, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { foreman, invoicer, jobHeader } from './job-load.js';
import { assertReadableStatus, readableBy, readerFor } from './job-readers.js';
import * as jobSql from './job-sql.js';

/** Each queue's Job count, and the loudest Machine Assignment attention needing a look across its Jobs. */
export async function summarizeJobQueues({ db, actor }: { db: Db; actor: JobActor }): Promise<JobQueueSummary> {
  const reader = readerFor(actor);
  const rows = await db
    .select({
      status: contractingJobs.status,
      looksFinished: jobSql.looksFinished,
      count: sql<number>`count(*)::integer`,
      openGapFlags: sql<number>`sum(${jobSql.openGapFlags})::integer`,
      critical: sql<number>`sum(${jobSql.readingsNeedingALookAt('critical')})::integer`,
      warning: sql<number>`sum(${jobSql.readingsNeedingALookAt('warning')})::integer`,
    })
    .from(contractingJobs)
    .where(readableBy(reader))
    .groupBy(contractingJobs.status, jobSql.looksFinished);
  const totals = new Map(jobQueues.map((queue) => [queue, { count: 0, critical: 0, warning: 0 }]));
  for (const { openGapFlags, critical, warning, count, ...row } of rows) {
    const total = totals.get(jobQueueOf(row));
    if (!total) continue;
    const attention = jobAssignmentAttentionCounts(openGapFlags, { critical, warning });
    total.count += count;
    total.critical += attention.critical;
    total.warning += attention.warning;
  }
  const queues = [...totals];
  return JobQueueSummary.parse({
    counts: Object.fromEntries(queues.map(([queue, { count }]) => [queue, count])),
    attention: Object.fromEntries(queues.map(([queue, total]) => [queue, countedAssignmentAttentionLevel(total)])),
  });
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

/** The list's order: the chosen column first, then the Job Number, so equal values keep a stable order. */
function jobListOrder({ sortBy, sortDirection }: Pick<JobListInput, 'sortBy' | 'sortDirection'>): SQL[] {
  const direction = (column: SQLWrapper) => getSortOrder(column, sortDirection);
  const byCode = [direction(contractingJobs.code), asc(contractingJobs.id)];
  if (sortBy === 'createdAt') return [direction(contractingJobs.createdAt), ...byCode];
  if (sortBy === 'customerName')
    return [direction(contractingCustomers.name), direction(contractingFarms.name), ...byCode];
  if (sortBy === 'invoicedAt')
    return [
      sortDirection === 'desc'
        ? sql`${contractingJobs.invoicedAt} desc nulls last`
        : sql`${contractingJobs.invoicedAt} asc nulls last`,
      ...byCode,
    ];
  return byCode;
}

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
      jobSql.jobNumberText,
      sql`${contractingCustomers.name}`,
      sql`${contractingFarms.name}`,
      sql`${contractingWorkTypes.name}`,
      sql`${foreman.name}`,
      sql`${contractingJobs.description}`,
      sql`${contractingJobs.invoiceNumber}`,
    ]),
  );
  const matching = () =>
    db
      .select({
        ...jobHeader,
        plannedStints: jobSql.stintCount('planned'),
        onSiteStints: jobSql.stintCount('on-site'),
        leftStints: jobSql.stintCount('left'),
        looksFinished: jobSql.looksFinished,
        openGapFlags: jobSql.openGapFlags,
        total: sql<number>`count(*) over ()`.mapWith(Number),
        readings: {
          critical: jobSql.readingsNeedingALookAt('critical'),
          warning: jobSql.readingsNeedingALookAt('warning'),
        },
      })
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
      .leftJoin(invoicer, eq(invoicer.id, contractingJobs.invoicedByUserId))
      .where(where)
      .orderBy(...jobListOrder(input))
      .$dynamic();
  const rows = await withPagination(matching(), input);
  // Every row carries the full match count; a stale cursor past the end asks for the first row to learn it.
  const counted = rows[0] ?? (input.cursor > 0 ? (await matching().limit(1))[0] : undefined);
  const total = counted?.total ?? 0;
  const seesMoney = jobReadSeesMoney(reader.mode);
  const items = rows.map(({ job, readings, total: _total, ...row }) =>
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
