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
  JobStageName,
  QuoteStatus,
  UserAccessSummary,
  UUID,
} from '@pkg/schema';
import { and, asc, eq, or, type SQL, sql } from 'drizzle-orm';

import { insertAuditEvent, jobAuditDescriptor } from '../audit/audit-service.js';
import { editJobDate as editJobDateService } from './job-date-edit-service.js';
import { JobCreateFromQuoteDeniedError, JobLifecycleTransitionDeniedError, JobNotFoundError } from './job-errors.js';
import {
  cancelJobLifecycle,
  pauseJobLifecycle,
  resumeJobLifecycle,
  uncancelJobLifecycle,
} from './job-lifecycle-service.js';
import { mapJobAuditRecord } from './job-mappers.js';
import { applyJobStageTransition } from './job-pipeline-service.js';
import { getJob, getJobSortOrder, mapJobSummary } from './job-read-service.js';
import {
  startStationBooking as startStationBookingTransition,
  stopStationBooking as stopStationBookingTransition,
} from './station-booking-service.js';

type JobLifecycleTransition = 'cancel' | 'pause' | 'resume' | 'uncancel';
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
        dueEnd: booking.dueEnd ?? null,
        dueEndSetManually: booking.dueEndSetManually ?? false,
        dueStart: booking.dueStart ?? null,
        dueStartSetManually: booking.dueStartSetManually ?? false,
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
      actualEnd: true,
      actualEndSetManually: true,
      actualStart: true,
      actualStartSetManually: true,
      dueDate: true,
      dueEnd: true,
      dueEndSetManually: true,
      dueStart: true,
      dueStartSetManually: true,
      isCancelled: true,
      isPaused: true,
      productId: true,
      quoteId: true,
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
          actualEnd: true,
          actualEndSetManually: true,
          actualStart: true,
          actualStartSetManually: true,
          dueEnd: true,
          dueEndSetManually: true,
          dueStart: true,
          dueStartSetManually: true,
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

export async function pauseJob({
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
  return transitionJobLifecycle({ access, actorUserId, db, id, transition: 'pause' });
}

export async function resumeJob({
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
  return transitionJobLifecycle({ access, actorUserId, db, id, transition: 'resume' });
}

export async function cancelJob({
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
  return transitionJobLifecycle({ access, actorUserId, db, id, transition: 'cancel' });
}

export async function uncancelJob({
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
  return transitionJobLifecycle({ access, actorUserId, db, id, transition: 'uncancel' });
}

export async function startJobStage({
  db,
  access,
  actorUserId,
  id,
  stage,
}: {
  db: Db;
  access: UserAccessSummary;
  actorUserId: AuthId;
  id: UUID;
  stage: JobStageName;
}): Promise<JobDetail> {
  return applyJobStageTransition({
    access,
    actorUserId,
    db,
    id,
    stage,
    intent: { transition: 'start' },
  });
}

export async function completeJobStage({
  db,
  access,
  actorUserId,
  id,
  stage,
}: {
  db: Db;
  access: UserAccessSummary;
  actorUserId: AuthId;
  id: UUID;
  stage: JobStageName;
}): Promise<JobDetail> {
  return applyJobStageTransition({
    access,
    actorUserId,
    db,
    id,
    stage,
    intent: { transition: 'complete' },
  });
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

async function transitionJobLifecycle({
  db,
  access,
  actorUserId,
  id,
  transition,
}: {
  db: Db;
  access: UserAccessSummary;
  actorUserId: AuthId;
  id: UUID;
  transition: JobLifecycleTransition;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        job: jobs,
      })
      .from(jobs)
      .where(eq(jobs.id, id))
      .for('update');

    if (!row) {
      throw new JobNotFoundError(id);
    }

    assertLifecycleFlagTransitionAllowed(row.job, transition);

    await applyLifecycleFlagTransition({
      actorUserId,
      before: mapJobAuditRecord(row.job),
      id,
      transition,
      tx,
    });

    return getJob({ access, db: tx, id });
  });
}

function assertLifecycleFlagTransitionAllowed(
  job: Pick<typeof jobs.$inferSelect, 'isCancelled' | 'isPaused'>,
  transition: JobLifecycleTransition,
): void {
  if (job.isCancelled && (transition === 'pause' || transition === 'resume')) {
    throw new JobLifecycleTransitionDeniedError('Cancelled jobs cannot be paused or resumed.');
  }

  if (transition === 'pause' && job.isPaused) {
    throw new JobLifecycleTransitionDeniedError('Job is already paused.');
  }

  if (transition === 'resume' && !job.isPaused) {
    throw new JobLifecycleTransitionDeniedError('Job is not paused.');
  }

  if (transition === 'cancel' && job.isCancelled) {
    throw new JobLifecycleTransitionDeniedError('Job is already cancelled.');
  }

  if (transition === 'uncancel' && !job.isCancelled) {
    throw new JobLifecycleTransitionDeniedError('Job is not cancelled.');
  }
}

async function applyLifecycleFlagTransition({
  actorUserId,
  before,
  id,
  transition,
  tx,
}: {
  actorUserId: AuthId;
  before: ReturnType<typeof mapJobAuditRecord>;
  id: UUID;
  transition: JobLifecycleTransition;
  tx: Parameters<typeof pauseJobLifecycle>[0]['tx'];
}): Promise<void> {
  switch (transition) {
    case 'cancel':
      return cancelJobLifecycle({ actorUserId, before, id, tx });
    case 'pause':
      return pauseJobLifecycle({ actorUserId, before, id, tx });
    case 'resume':
      return resumeJobLifecycle({ actorUserId, before, id, tx });
    case 'uncancel':
      return uncancelJobLifecycle({ actorUserId, before, id, tx });
  }
}
