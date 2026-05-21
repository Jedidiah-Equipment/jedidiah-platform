import {
  createEscapedContainsSearchCondition,
  type Db,
  getPaginationQueryOptions,
  getSortOrder,
  getUniqueViolationConstraint,
  jobStages,
  jobs,
  quotes,
} from '@pkg/db';
import { JOB_STAGE_PIPELINE, parseJobCodeSearch } from '@pkg/domain';
import type {
  AuthId,
  JobCreateFromQuoteInput,
  JobCreateInput,
  JobDetail,
  JobLifecycleStatus,
  JobListInput,
  JobListResult,
  JobStageName,
  UserAccessSummary,
  UUID,
} from '@pkg/schema';
import { and, asc, eq, or, type SQL, sql } from 'drizzle-orm';

import { insertAuditEvent, jobAuditDescriptor } from '../audit/audit-service.js';
import { JobLifecycleTransitionDeniedError, JobNotFoundError, JobQuoteConversionDeniedError } from './job-errors.js';
import {
  cancelJobLifecycle,
  pauseJobLifecycle,
  resumeJobLifecycle,
  uncancelJobLifecycle,
} from './job-lifecycle-service.js';
import { mapJobAuditRecord } from './job-mappers.js';
import { applyJobStageTransition } from './job-pipeline-service.js';
import { getJob, getJobSortColumn, mapJobSummary } from './job-read-service.js';

type JobLifecycleTransition = 'cancel' | 'pause' | 'resume' | 'uncancel';

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
    const [job] = await tx
      .insert(jobs)
      .values({
        dueEnd: input.dueEnd ?? null,
        dueEndSetManually: input.dueEnd != null,
        dueStart: input.dueStart ?? null,
        dueStartSetManually: input.dueStart != null,
        productId: input.productId,
      })
      .returning();

    if (!job) {
      throw new Error('Job insert did not return a row');
    }

    await tx.insert(jobStages).values(
      JOB_STAGE_PIPELINE.map(({ sequence, stage }) => ({
        jobId: job.id,
        sequence,
        stage,
      })),
    );

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
  });
}

export async function createJobFromQuote({
  db,
  access,
  input,
  actorUserId,
}: {
  db: Db;
  access: UserAccessSummary;
  input: JobCreateFromQuoteInput;
  actorUserId: AuthId;
}): Promise<JobDetail> {
  try {
    return await db.transaction(async (tx) => {
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, input.quoteId)).for('update');

      if (!quote) {
        throw new JobQuoteConversionDeniedError('Quote not found.');
      }

      if (quote.status !== 'accepted' && quote.status !== 'draft') {
        throw new JobQuoteConversionDeniedError('Only draft or accepted quotes can be converted into jobs.');
      }

      const existingJob = await tx.query.jobs.findFirst({
        columns: {
          id: true,
        },
        where: eq(jobs.quoteId, input.quoteId),
      });

      if (existingJob) {
        throw new JobQuoteConversionDeniedError('Quote has already been converted into a job.');
      }

      const [job] = await tx
        .insert(jobs)
        .values({
          dueEnd: input.dueEnd ?? null,
          dueEndSetManually: input.dueEnd != null,
          dueStart: input.dueStart ?? null,
          dueStartSetManually: input.dueStart != null,
          productId: quote.productId,
          quoteId: quote.id,
        })
        .returning();

      if (!job) {
        throw new Error('Job insert did not return a row');
      }

      await tx.insert(jobStages).values(
        JOB_STAGE_PIPELINE.map(({ sequence, stage }) => ({
          jobId: job.id,
          sequence,
          stage,
        })),
      );

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
    });
  } catch (error) {
    if (getUniqueViolationConstraint(error) === 'job_quote_id_unique') {
      throw new JobQuoteConversionDeniedError('Quote has already been converted into a job.');
    }

    throw error;
  }
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
  const sortColumn = getJobSortColumn(input.sortBy);
  const orderBy = getSortOrder(sortColumn, input.sortDirection);

  const rows = await db.query.jobs.findMany({
    columns: {
      createdAt: true,
      id: true,
      code: true,
      actualEnd: true,
      actualEndSetManually: true,
      actualStart: true,
      actualStartSetManually: true,
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

  if (input.filters.lifecycleStatuses.length > 0) {
    conditions.push(buildLifecycleStatusWhere(input.filters.lifecycleStatuses));
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

function buildLifecycleStatusWhere(statuses: readonly JobLifecycleStatus[]): SQL {
  const conditions = statuses.map((status) => {
    switch (status) {
      case 'active':
        return and(
          eq(jobs.isCancelled, false),
          eq(jobs.isPaused, false),
          sql`${jobs.actualStart} is not null`,
          sql`${jobs.actualEnd} is null`,
        );
      case 'cancelled':
        return eq(jobs.isCancelled, true);
      case 'complete':
        return and(eq(jobs.isCancelled, false), eq(jobs.isPaused, false), sql`${jobs.actualEnd} is not null`);
      case 'not-started':
        return and(
          eq(jobs.isCancelled, false),
          eq(jobs.isPaused, false),
          sql`${jobs.actualStart} is null`,
          sql`${jobs.actualEnd} is null`,
        );
      case 'paused':
        return and(eq(jobs.isCancelled, false), eq(jobs.isPaused, true));
      default:
        return sql`false`;
    }
  });

  return or(...conditions) ?? sql`false`;
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
