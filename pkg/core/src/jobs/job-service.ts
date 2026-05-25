import {
  createEscapedContainsSearchCondition,
  type DatabaseTransaction,
  type Db,
  getPaginationQueryOptions,
  jobStageStations,
  jobStages,
  jobs,
  quotes,
} from '@pkg/db';
import { hasPermission, JOB_STAGE_PIPELINE, parseJobCodeSearch } from '@pkg/domain';
import type {
  AuthId,
  JobCreateInput,
  JobDateEditInput,
  JobDetail,
  JobListInput,
  JobListResult,
  QuoteStatus,
  UserAccessSummary,
  UUID,
} from '@pkg/schema';
import { and, asc, eq, gte, inArray, or, type SQL, sql } from 'drizzle-orm';

import { insertAuditEvent, jobAuditDescriptor } from '../audit/audit-service.js';
import { editJobDate as editJobDateService } from './job-date-edit-service.js';
import { JobCreateFromQuoteDeniedError } from './job-errors.js';
import { mapJobAuditRecord } from './job-mappers.js';
import { getJob, getJobSortOrder, mapJobSummary } from './job-read-service.js';
import {
  startStationBooking as startStationBookingTransition,
  stopStationBooking as stopStationBookingTransition,
} from './station-booking-service.js';

export { setJobStatus } from './job-status-service.js';

const JOB_ELIGIBLE_QUOTE_STATUSES: readonly QuoteStatus[] = ['accepted', 'draft', 'sent'];

export async function createJob({
  db,
  access,
  input,
  actorUserId,
}: {
  db: Db;
  access: UserAccessSummary;
  input: JobCreateInput;
  actorUserId: AuthId;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    return createJobInTransaction({ access, actorUserId, input, tx });
  });
}

async function createJobInTransaction({
  access,
  actorUserId,
  input,
  tx,
}: {
  access: UserAccessSummary;
  actorUserId: AuthId;
  input: JobCreateInput;
  tx: DatabaseTransaction;
}): Promise<JobDetail> {
  const quoteId = input.quoteId ?? null;

  if (quoteId) {
    await validateJobQuoteForCreate({ access, allowedStatuses: JOB_ELIGIBLE_QUOTE_STATUSES, quoteId, tx });
  }

  const [job] = await tx
    .insert(jobs)
    .values({
      dueDate: input.dueDate ?? null,
      productId: input.productId,
      quoteId,
    })
    .returning();

  if (!job) {
    throw new Error('Job insert did not return a row');
  }

  const stageRows = await tx
    .insert(jobStages)
    .values(buildJobStageInsertValues({ jobId: job.id }))
    .returning();

  const stageRowsByStage = new Map(stageRows.map((stage) => [stage.stage, stage]));
  const stationBookingValues =
    input.stages?.flatMap((stage) => {
      const stageRow = stageRowsByStage.get(stage.stage);
      if (!stageRow) {
        throw new Error(`Missing inserted row for ${stage.stage}.`);
      }

      return stage.stationBookings.map((booking) => ({
        plannedEnd: booking.plannedEnd ?? null,
        plannedStart: booking.plannedStart ?? null,
        jobStageId: stageRow.id,
        stationId: booking.stationId,
      }));
    }) ?? [];

  if (stationBookingValues.length > 0) {
    await tx.insert(jobStageStations).values(stationBookingValues);
  }

  await insertAuditEvent({
    db: tx,
    input: {
      action: 'created',
      actorUserId,
      after: mapJobAuditRecord(job),
      before: null,
      changes: null,
      entityId: job.id,
      entityType: jobAuditDescriptor.entityType,
    },
  });

  return getJob({ access, db: tx, id: job.id });
}

async function validateJobQuoteForCreate({
  access,
  allowedStatuses,
  quoteId,
  tx,
}: {
  access: UserAccessSummary;
  allowedStatuses?: readonly QuoteStatus[];
  quoteId: UUID;
  tx: DatabaseTransaction;
}): Promise<void> {
  if (!hasPermission(access, 'quote:read')) {
    throw new JobCreateFromQuoteDeniedError('Quote not found.');
  }

  const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for('update');

  if (!quote) {
    throw new JobCreateFromQuoteDeniedError('Quote not found.');
  }

  if (allowedStatuses && !allowedStatuses.includes(quote.status)) {
    throw new JobCreateFromQuoteDeniedError("This quote's status does not allow job creation.");
  }

  return;
}

function buildJobStageInsertValues({ jobId }: { jobId: UUID }) {
  return JOB_STAGE_PIPELINE.map(({ sequence, stage }) => {
    return {
      jobId,
      sequence,
      stage,
    };
  });
}

export async function listJobs({
  db,
  input,
}: {
  db: Db;
  access: UserAccessSummary;
  input: JobListInput;
}): Promise<JobListResult> {
  const where = buildJobListWhere(input);
  const orderBy = getJobSortOrder(input.sortBy, input.sortDirection);

  const rows = await db.query.jobs.findMany({
    columns: {
      createdAt: true,
      id: true,
      code: true,
      dueDate: true,
      productId: true,
      quoteId: true,
      status: true,
      updatedAt: true,
    },
    where,
    orderBy: [orderBy, asc(jobs.id)],
    ...getPaginationQueryOptions(input),
    with: {
      product: {
        columns: {
          modelCode: true,
          name: true,
        },
      },
      quote: {
        columns: {
          code: true,
        },
        with: {
          customer: {
            columns: {
              companyName: true,
            },
          },
        },
      },
      stages: {
        columns: {
          id: true,
          jobId: true,
          sequence: true,
          stage: true,
        },
        orderBy: [asc(jobStages.sequence)],
        with: {
          stations: {
            with: {
              station: true,
            },
          },
        },
      },
    },
  });

  const total = await db.$count(jobs, where);

  return {
    items: rows.map(mapJobSummary),
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
    total,
  };
}

function buildJobListWhere(input: JobListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.filters.jobId) {
    conditions.push(eq(jobs.id, input.filters.jobId));
  }

  const statuses = input.filters.statuses ?? [];

  if (statuses.length > 0) {
    conditions.push(inArray(jobs.status, statuses));
  }

  if (input.filters.createdAtStart) {
    conditions.push(gte(jobs.createdAt, new Date(input.filters.createdAtStart)));
  }

  if (input.search) {
    const codeSearch = parseJobCodeSearch(input.search);
    const searchWhere = or(
      createEscapedContainsSearchCondition(sql`${jobs.id}::text`, input.search),
      createEscapedContainsSearchCondition(sql`${jobs.code}::text`, input.search),
      codeSearch === undefined ? undefined : eq(jobs.code, codeSearch),
    );

    if (searchWhere) {
      conditions.push(searchWhere);
    }
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function startStationBooking({
  db,
  access,
  actorUserId,
  id,
}: {
  db: Db;
  access: UserAccessSummary;
  actorUserId: AuthId;
  id: UUID;
}): Promise<JobDetail> {
  return startStationBookingTransition({ access, actorUserId, db, id });
}

export async function stopStationBooking({
  db,
  access,
  actorUserId,
  id,
}: {
  db: Db;
  access: UserAccessSummary;
  actorUserId: AuthId;
  id: UUID;
}): Promise<JobDetail> {
  return stopStationBookingTransition({ access, actorUserId, db, id });
}

export async function editJobDate({
  db,
  access,
  actorUserId,
  input,
}: {
  db: Db;
  access: UserAccessSummary;
  actorUserId: AuthId;
  input: JobDateEditInput;
}): Promise<JobDetail> {
  return editJobDateService({ access, actorUserId, db, input });
}
