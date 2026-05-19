import {
  createLikeSearchPattern,
  type DatabaseTransaction,
  type Db,
  getPaginationOffset,
  getUniqueViolationConstraint,
  jobEvents,
  jobStages,
  jobs,
  LIKE_SEARCH_ESCAPE,
  type products,
  quotes,
  type user,
} from '@pkg/db';
import {
  canViewStage,
  deriveStageJobEvent,
  evaluateStageTransition,
  getStageTransitionAvailability,
  JOB_STAGE_PIPELINE,
  parseJobCodeSearch,
  type StageTransition,
} from '@pkg/domain';
import {
  type AuthId,
  Job,
  type JobCreateFromQuoteInput,
  type JobCreateInput,
  type JobDetail,
  JobEvent,
  JobEventDerivationStage,
  type JobLifecycleStatus,
  type JobListInput,
  type JobListResult,
  type JobSortBy,
  JobStage,
  type JobStageName,
  type JobStageRollup,
  type JobStageStatusInput,
  JobStageSummary,
  type JobSummary,
  QuoteCode,
  type UserAccessSummary,
  type UUID,
} from '@pkg/schema';
import { and, asc, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';

import {
  createAuditChanges,
  insertAuditEvent,
  jobAuditDescriptor,
  jobStageAuditDescriptor,
} from '../audit/audit-service.js';
import {
  JobLifecycleTransitionDeniedError,
  JobNotFoundError,
  JobQuoteConversionDeniedError,
  JobStageTransitionDeniedError,
} from './job-errors.js';

type JobRow = typeof jobs.$inferSelect;
type JobEventRow = typeof jobEvents.$inferSelect;
type JobEventWithActorRow = JobEventRow & {
  actor: Pick<typeof user.$inferSelect, 'name'> | null;
};
type JobStageRow = typeof jobStages.$inferSelect;
type ProductRow = Pick<typeof products.$inferSelect, 'modelCode' | 'name'>;
type QuoteRow = Pick<typeof quotes.$inferSelect, 'code'>;
type JobWithProductRow = JobRow & {
  product: ProductRow;
  quote: QuoteRow | null;
  stages: JobStageRow[];
};
type JobAuditRecord = Pick<JobRow, 'code' | 'dueDate' | 'lifecycleStatus' | 'productId' | 'quoteId'>;

type JobLifecycleTransition = 'pause' | 'resume' | 'cancel';

const jobLifecycleTransitionConfig = {
  cancel: {
    allowedFrom: ['active', 'paused'],
    eventType: 'job.cancelled',
    nextStatus: 'cancelled',
  },
  pause: {
    allowedFrom: ['active'],
    eventType: 'job.paused',
    nextStatus: 'paused',
  },
  resume: {
    allowedFrom: ['paused'],
    eventType: 'job.resumed',
    nextStatus: 'active',
  },
} as const satisfies Record<
  JobLifecycleTransition,
  {
    allowedFrom: readonly JobLifecycleStatus[];
    eventType: Extract<JobEvent['eventType'], `job.${string}`>;
    nextStatus: JobLifecycleStatus;
  }
>;

export function mapJob(row: JobRow): Job {
  return Job.parse({
    createdAt: row.createdAt.toISOString(),
    code: row.code,
    dueDate: row.dueDate,
    id: row.id,
    lifecycleStatus: row.lifecycleStatus,
    productId: row.productId,
    quoteId: row.quoteId,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function mapJobStage(row: JobStageRow): JobStage {
  return JobStage.parse({
    completedAt: row.completedAt?.toISOString() ?? null,
    id: row.id,
    jobId: row.jobId,
    sequence: row.sequence,
    stage: row.stage,
    startedAt: row.startedAt?.toISOString() ?? null,
    status: row.status,
  });
}

export function mapJobEvent(row: JobEventRow): JobEvent {
  return parseJobEvent(row, null);
}

function mapJobEventWithActor(row: JobEventWithActorRow): JobEvent {
  return parseJobEvent(row, row.actor?.name ?? null);
}

function parseJobEvent(row: JobEventRow, actorName: string | null): JobEvent {
  // DB currently stores event_type as text; this parse intentionally fails fast until the column is constrained.
  return JobEvent.parse({
    actorName,
    actorUserId: row.actorUserId,
    eventType: row.eventType,
    id: row.id,
    jobId: row.jobId,
    occurredAt: row.occurredAt.toISOString(),
    payload: row.payload,
    stageId: row.stageId,
  });
}

function mapJobEventDerivationStage(row: JobStageRow): JobEventDerivationStage {
  return JobEventDerivationStage.parse({
    completedAt: row.completedAt?.toISOString() ?? null,
    stage: row.stage,
    startedAt: row.startedAt?.toISOString() ?? null,
    status: row.status,
  });
}

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
        dueDate: input.dueDate ?? null,
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
        status: 'pending' as const,
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

      if (quote.status !== 'accepted') {
        throw new JobQuoteConversionDeniedError('Only accepted quotes can be converted into jobs.');
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
          dueDate: input.dueDate ?? null,
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
          status: 'pending' as const,
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
  const orderBy = input.sortDirection === 'desc' ? desc(sortColumn) : asc(sortColumn);

  const rows = await db.query.jobs.findMany({
    columns: {
      createdAt: true,
      id: true,
      code: true,
      dueDate: true,
      lifecycleStatus: true,
      productId: true,
      quoteId: true,
      updatedAt: true,
    },
    where,
    orderBy: [orderBy, asc(jobs.id)],
    limit: input.pageSize,
    offset: getPaginationOffset(input),
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
      },
      stages: {
        columns: {
          completedAt: true,
          id: true,
          jobId: true,
          sequence: true,
          stage: true,
          startedAt: true,
          status: true,
        },
        orderBy: [asc(jobStages.sequence)],
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
    conditions.push(inArray(jobs.lifecycleStatus, input.filters.lifecycleStatuses));
  }

  if (input.search) {
    const searchPattern = createLikeSearchPattern(input.search);
    const codeSearch = parseJobCodeSearch(input.search);
    conditions.push(
      sql`(${jobs.id}::text ilike ${searchPattern} escape ${LIKE_SEARCH_ESCAPE} or ${jobs.code}::text ilike ${searchPattern} escape ${LIKE_SEARCH_ESCAPE}${codeSearch === undefined ? sql`` : sql` or ${jobs.code} = ${codeSearch}`})`,
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getJob({
  db,
  id,
  access,
}: {
  db: Db | DatabaseTransaction;
  id: UUID;
  access: UserAccessSummary;
}): Promise<JobDetail> {
  const row = await db.query.jobs.findFirst({
    columns: {
      createdAt: true,
      code: true,
      dueDate: true,
      id: true,
      lifecycleStatus: true,
      productId: true,
      quoteId: true,
      updatedAt: true,
    },
    where: eq(jobs.id, id),
    with: {
      events: {
        orderBy: [desc(jobEvents.occurredAt), desc(jobEvents.id)],
        with: {
          actor: {
            columns: {
              name: true,
            },
          },
        },
      },
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
      },
      stages: {
        orderBy: [asc(jobStages.sequence)],
      },
    },
  });

  if (!row) {
    throw new JobNotFoundError(id);
  }

  return {
    ...mapJobSummary(row),
    stages: mapJobDetailStages({ access, job: row, stageRows: row.stages }),
    workflowEvents: mapJobWorkflowEvents({ access, eventRows: row.events, stageRows: row.stages }),
  };
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
  return transitionJobStage({
    access,
    actorUserId,
    db,
    id,
    stage,
    transition: 'start',
    values: {
      startedAt: new Date(),
    },
  });
}

export async function setJobStageStatus({
  db,
  access,
  actorUserId,
  input,
}: {
  db: Db;
  access: UserAccessSummary;
  actorUserId: AuthId;
  input: JobStageStatusInput;
}): Promise<JobDetail> {
  if (input.status === 'complete') {
    return completeJobStageFromStatus({ access, actorUserId, db, id: input.id, stage: input.stage });
  }

  return transitionJobStage({
    access,
    actorUserId,
    db,
    id: input.id,
    stage: input.stage,
    transition: 'set-status',
    values: {
      status: input.status,
    },
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
  return transitionJobStage({
    access,
    actorUserId,
    db,
    id,
    stage,
    transition: 'complete',
    values: {
      completedAt: new Date(),
      status: 'complete',
    },
  });
}

async function completeJobStageFromStatus({
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
  return db.transaction(async (tx) => {
    const transitionTarget = await readStageTransitionTarget({ db: tx, id, stage });
    const result = evaluateStageTransition({
      access,
      job: transitionTarget.job,
      previousStage: transitionTarget.previousStage,
      stage: {
        ...transitionTarget.stage,
        completedAt: null,
      },
      transition: 'complete',
    });

    if (!result.allowed) {
      throw new JobStageTransitionDeniedError(result.reason);
    }

    if (transitionTarget.stage.completedAt) {
      if (transitionTarget.stage.status !== 'complete') {
        return applyJobStageTransition({
          access,
          actorUserId,
          id,
          stage,
          transition: 'set-status',
          transitionTarget,
          tx,
          values: {
            status: 'complete',
          },
        });
      }

      return getJob({ access, db: tx, id });
    }

    return applyJobStageTransition({
      access,
      actorUserId,
      id,
      stage,
      transition: 'complete',
      transitionTarget,
      tx,
      values: {
        completedAt: new Date(),
        status: 'complete',
      },
    });
  });
}

function mapJobSummary(row: JobWithProductRow): JobSummary {
  return {
    ...mapJob(row),
    productModelCode: row.product.modelCode,
    productName: row.product.name,
    quoteCode: row.quote ? QuoteCode.parse(row.quote.code) : null,
    stages: row.stages.map(mapJobStageSummary),
  };
}

function mapJobStageSummary(row: JobStageRow): JobStageSummary {
  return JobStageSummary.parse({
    ...mapJobStage(row),
    department: row.stage,
  });
}

function getJobSortColumn(sortBy: JobSortBy): SQL {
  const columns = {
    code: sql`${jobs.code}`,
    createdAt: sql`${jobs.createdAt}`,
    id: sql`${jobs.id}`,
    lifecycleStatus: sql`${jobs.lifecycleStatus}`,
  } as const satisfies Record<JobSortBy, SQL>;

  return columns[sortBy];
}

function mapStageAccess({
  access,
  job,
  previousStage,
  stage,
}: {
  access: UserAccessSummary;
  job: JobRow;
  previousStage: JobStageRow | null;
  stage: JobStageRow;
}): JobStageRollup {
  if (canViewStage(access, stage)) {
    return {
      ...mapJobStageSummary(stage),
      access: 'visible',
      transitionAvailability: getStageTransitionAvailability({
        access,
        job,
        previousStage,
        stage,
      }),
    };
  }

  return {
    ...mapJobStageSummary(stage),
    access: 'summary',
  };
}

function mapJobDetailStages({
  access,
  job,
  stageRows,
}: {
  access: UserAccessSummary;
  job: JobRow;
  stageRows: JobStageRow[];
}): JobStageRollup[] {
  return stageRows.map((stageRow, index) =>
    mapStageAccess({
      access,
      job,
      previousStage: index === 0 ? null : (stageRows[index - 1] ?? null),
      stage: stageRow,
    }),
  );
}

function mapJobWorkflowEvents({
  access,
  eventRows,
  stageRows,
}: {
  access: UserAccessSummary;
  eventRows: JobEventWithActorRow[];
  stageRows: JobStageRow[];
}): JobEvent[] {
  const stageRowsById = new Map(stageRows.map((stage) => [stage.id, stage]));

  return eventRows
    .filter((event) => {
      if (!event.stageId) return true;

      const stage = stageRowsById.get(event.stageId);
      return stage ? canViewStage(access, stage) : false;
    })
    .map(mapJobEventWithActor)
    .sort(compareJobEventsNewestFirst);
}

function compareJobEventsNewestFirst(left: JobEvent, right: JobEvent): number {
  const occurredAtOrder = right.occurredAt.localeCompare(left.occurredAt);
  return occurredAtOrder === 0 ? right.id.localeCompare(left.id) : occurredAtOrder;
}

async function transitionJobStage({
  db,
  access,
  actorUserId,
  id,
  stage,
  transition,
  values,
}: {
  db: Db;
  access: UserAccessSummary;
  actorUserId: AuthId;
  id: UUID;
  stage: JobStageName;
  transition: StageTransition;
  values: Partial<Pick<JobStageRow, 'completedAt' | 'startedAt' | 'status'>>;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    const transitionTarget = await readStageTransitionTarget({ db: tx, id, stage });
    return applyJobStageTransition({ access, actorUserId, id, stage, transition, transitionTarget, tx, values });
  });
}

async function applyJobStageTransition({
  access,
  actorUserId,
  id,
  stage,
  transition,
  transitionTarget,
  tx,
  values,
}: {
  access: UserAccessSummary;
  actorUserId: AuthId;
  id: UUID;
  stage: JobStageName;
  transition: StageTransition;
  transitionTarget: StageTransitionTarget;
  tx: DatabaseTransaction;
  values: Partial<Pick<JobStageRow, 'completedAt' | 'startedAt' | 'status'>>;
}): Promise<JobDetail> {
  const result = evaluateStageTransition({
    access,
    job: transitionTarget.job,
    previousStage: transitionTarget.previousStage,
    stage: transitionTarget.stage,
    transition,
  });

  if (!result.allowed) {
    throw new JobStageTransitionDeniedError(result.reason);
  }

  const [updatedStage] = await tx
    .update(jobStages)
    .set(values)
    .where(and(eq(jobStages.jobId, id), eq(jobStages.stage, stage)))
    .returning();

  if (!updatedStage) {
    throw new JobNotFoundError(id);
  }

  await insertAuditEvent({
    db: tx,
    input: {
      action: 'updated',
      actorUserId,
      after: mapJobStage(updatedStage),
      before: mapJobStage(transitionTarget.stage),
      changes: createAuditChanges(mapJobStage(transitionTarget.stage), mapJobStage(updatedStage), {
        completedAt: 'completed at',
        startedAt: 'started at',
        status: 'status',
      }),
      entityId: updatedStage.id,
      entityType: jobStageAuditDescriptor.entityType,
    },
  });

  const jobEvent = deriveStageJobEvent({
    after: mapJobEventDerivationStage(updatedStage),
    before: mapJobEventDerivationStage(transitionTarget.stage),
    transition,
  });

  await tx.insert(jobEvents).values({
    actorUserId,
    eventType: jobEvent.eventType,
    jobId: id,
    occurredAt: new Date(),
    payload: jobEvent.payload,
    stageId: updatedStage.id,
  });

  if (transition === 'complete' && updatedStage.stage === 'dispatch') {
    await completeJobLifecycle({
      actorUserId,
      before: transitionTarget.job,
      id,
      tx,
    });
  }

  return getJob({ access, db: tx, id });
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

    const config = jobLifecycleTransitionConfig[transition];
    if (!(config.allowedFrom as readonly JobLifecycleStatus[]).includes(row.job.lifecycleStatus)) {
      throw new JobLifecycleTransitionDeniedError(
        getLifecycleTransitionDeniedReason(transition, row.job.lifecycleStatus),
      );
    }

    await applyJobLifecycleStatusChange({
      actorUserId,
      before: mapJobAuditRecord(row.job),
      eventType: config.eventType,
      id,
      nextStatus: config.nextStatus,
      tx,
    });

    return getJob({ access, db: tx, id });
  });
}

function mapJobAuditRecord(
  job: Pick<JobRow, 'code' | 'dueDate' | 'lifecycleStatus' | 'productId' | 'quoteId'>,
): JobAuditRecord {
  return {
    code: job.code,
    dueDate: job.dueDate,
    lifecycleStatus: job.lifecycleStatus,
    productId: job.productId,
    quoteId: job.quoteId,
  };
}

async function completeJobLifecycle({
  actorUserId,
  before,
  id,
  tx,
}: {
  actorUserId: AuthId;
  before: JobAuditRecord;
  id: UUID;
  tx: DatabaseTransaction;
}): Promise<void> {
  await applyJobLifecycleStatusChange({
    actorUserId,
    before,
    eventType: 'job.completed',
    id,
    nextStatus: 'complete',
    tx,
  });
}

async function applyJobLifecycleStatusChange({
  actorUserId,
  before,
  eventType,
  id,
  nextStatus,
  tx,
}: {
  actorUserId: AuthId;
  before: JobAuditRecord;
  eventType: Extract<JobEvent['eventType'], `job.${string}`>;
  id: UUID;
  nextStatus: JobLifecycleStatus;
  tx: DatabaseTransaction;
}): Promise<void> {
  const [updatedJob] = await tx
    .update(jobs)
    .set({
      lifecycleStatus: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, id))
    .returning();

  if (!updatedJob) {
    throw new JobNotFoundError(id);
  }

  const after = mapJobAuditRecord(updatedJob);
  await insertAuditEvent({
    db: tx,
    input: {
      action: 'updated',
      actorUserId,
      after,
      before,
      changes: createAuditChanges(before, after, {
        lifecycleStatus: jobAuditDescriptor.fields.lifecycleStatus ?? 'lifecycle status',
      }),
      entityId: updatedJob.id,
      entityType: jobAuditDescriptor.entityType,
    },
  });

  await tx.insert(jobEvents).values({
    actorUserId,
    eventType,
    jobId: id,
    occurredAt: new Date(),
    payload: {
      fromLifecycleStatus: before.lifecycleStatus,
      toLifecycleStatus: nextStatus,
    },
    stageId: null,
  });
}

function getLifecycleTransitionDeniedReason(
  transition: JobLifecycleTransition,
  lifecycleStatus: JobLifecycleStatus,
): string {
  if (lifecycleStatus === 'complete' || lifecycleStatus === 'cancelled') {
    return 'Terminal jobs cannot change lifecycle status.';
  }

  if (transition === 'pause') {
    return 'Only active jobs can be paused.';
  }

  if (transition === 'resume') {
    return 'Only paused jobs can be resumed.';
  }

  return 'Only active or paused jobs can be cancelled.';
}

type StageTransitionTarget = {
  job: JobAuditRecord;
  previousStage: JobStageRow | null;
  stage: JobStageRow;
};

async function readStageTransitionTarget({
  db,
  id,
  stage,
}: {
  db: DatabaseTransaction;
  id: UUID;
  stage: JobStageName;
}): Promise<StageTransitionTarget> {
  const rows = await db
    .select({
      job: jobs,
      stage: jobStages,
    })
    .from(jobs)
    .innerJoin(jobStages, eq(jobStages.jobId, jobs.id))
    .where(eq(jobs.id, id))
    .orderBy(asc(jobStages.sequence))
    .for('update');

  const currentStageIndex = rows.findIndex((row) => row.stage.stage === stage);
  const currentRow = rows[currentStageIndex];
  const currentStage = currentRow?.stage;

  if (!currentStage) {
    throw new JobNotFoundError(id);
  }

  return {
    job: mapJobAuditRecord(currentRow.job),
    previousStage: currentStageIndex > 0 ? (rows[currentStageIndex - 1]?.stage ?? null) : null,
    stage: currentStage,
  };
}
