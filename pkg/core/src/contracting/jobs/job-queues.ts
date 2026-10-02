import type { Db } from '@pkg/db';
import { contractingCustomers, contractingFarms, contractingJobs, contractingWorkTypes } from '@pkg/db/contracting';
import { JOHANNESBURG_TIME_ZONE } from '@pkg/domain';
import { formatJobNumber, type JobActor, jobQueueStatus, jobReadSeesMoney } from '@pkg/domain/contracting';
import { type JobQueue, JobQueueCounts, JobSummary, jobQueues } from '@pkg/schema/contracting';
import { and, asc, eq, sql } from 'drizzle-orm';
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
  const count = (queue: JobQueue) =>
    rows
      .filter((row) => row.status === jobQueueStatus[queue] && (queue !== 'looks-finished' || row.looksFinished))
      .reduce((total, row) => total + row.count, 0);
  return JobQueueCounts.parse(Object.fromEntries(jobQueues.map((queue) => [queue, count(queue)])));
}

export async function hasActiveJobAttention({ db, actor }: { db: Db; actor: JobActor }) {
  const reader = readerFor(actor);
  const rows = await db
    .select({ id: contractingJobs.id })
    .from(contractingJobs)
    .where(
      and(
        eq(contractingJobs.status, 'active'),
        readableBy(reader),
        sql`${jobSql.openGapFlags} + ${jobSql.readingsNeedingALook} > 0`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function listJobs({
  db,
  actor,
  queue,
  limit,
  offset,
  invoicedInMonth,
}: {
  db: Db;
  actor: JobActor;
  queue: JobQueue;
  limit: number;
  offset: number;
  /** Honoured only for the invoiced queue: Jobs stamped in this South African calendar month. */
  invoicedInMonth?: string | undefined;
}) {
  const reader = readerFor(actor);
  assertReadableStatus(jobQueueStatus[queue], reader);
  const rows = await db
    .select({
      ...jobHeader,
      plannedStints: jobSql.stintCount('planned'),
      onSiteStints: jobSql.stintCount('on-site'),
      leftStints: jobSql.stintCount('left'),
      looksFinished: jobSql.looksFinished,
      openGapFlags: jobSql.openGapFlags,
      needsALook: sql<number>`${jobSql.openGapFlags} + ${jobSql.readingsNeedingALook}`,
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
    .where(
      and(
        eq(contractingJobs.status, jobQueueStatus[queue]),
        queue === 'looks-finished' ? jobSql.looksFinished : undefined,
        readableBy(reader),
        queue === 'invoiced' && invoicedInMonth
          ? sql`date_trunc('month', ${contractingJobs.invoicedAt} at time zone ${JOHANNESBURG_TIME_ZONE}) = date_trunc('month', ${invoicedInMonth}::timestamp)`
          : undefined,
      ),
    )
    .orderBy(asc(contractingJobs.code))
    .limit(limit)
    .offset(offset);
  const seesMoney = jobReadSeesMoney(reader.mode);
  return rows.map(({ job, ...row }) =>
    JobSummary.parse({
      ...job,
      ...row,
      jobNumber: formatJobNumber(job.code),
      pricedTotal: seesMoney ? job.pricedTotal : null,
      pricedAt: job.pricedAt?.toISOString() ?? null,
      invoicedAt: job.invoicedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    }),
  );
}
