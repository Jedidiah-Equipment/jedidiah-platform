import { type DatabaseTransaction, type Db, jobStages, jobs, products } from '@pkg/db';
import {
  canViewStage,
  evaluateStageTransition,
  getStageTransitionAvailability,
  JOB_STAGE_PIPELINE,
  type StageTransition,
} from '@pkg/domain';
import {
  type AuthId,
  type Job,
  type JobCreateInput,
  type JobDetail,
  type JobListInput,
  type JobListResult,
  type JobStage,
  JobStage as JobStageContract,
  type JobStageName,
  type JobStageRollup,
  type JobStageStatusInput,
  type JobSummary,
  type UserAccessSummary,
  type UUID,
} from '@pkg/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';

import {
  createAuditChanges,
  insertAuditEvent,
  jobAuditDescriptor,
  jobStageAuditDescriptor,
} from '../audit/audit-service.js';
import { JobNotFoundError, JobStageTransitionDeniedError } from './job-errors.js';

type JobRow = typeof jobs.$inferSelect;
type JobStageRow = typeof jobStages.$inferSelect;
type ProductRow = Pick<typeof products.$inferSelect, 'modelCode' | 'name'>;
type JobWithProductRow = JobRow & {
  productModelCode: ProductRow['modelCode'];
  productName: ProductRow['name'];
};

export function mapJob(row: JobRow): Job {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    lifecycleStatus: row.lifecycleStatus,
    productId: row.productId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapJobStage(row: JobStageRow): JobStage {
  return JobStageContract.parse({
    completedAt: row.completedAt?.toISOString() ?? null,
    id: row.id,
    jobId: row.jobId,
    sequence: row.sequence,
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
        after: job,
        before: null,
        changes: null,
        entityId: job.id,
        entityType: jobAuditDescriptor.entityType,
      },
    });

    return readJobDetail({ access, db: tx, id: job.id });
  });
}

export async function listJobs({
  db,
  access,
  input: _input,
}: {
  db: Db;
  access: UserAccessSummary;
  input: JobListInput;
}): Promise<JobListResult> {
  const visibleStages = getVisibleStages(access);

  if (visibleStages?.length === 0) {
    return { jobs: [] };
  }

  const rows = await db
    .selectDistinct({
      createdAt: jobs.createdAt,
      id: jobs.id,
      lifecycleStatus: jobs.lifecycleStatus,
      productId: jobs.productId,
      productModelCode: products.modelCode,
      productName: products.name,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .innerJoin(products, eq(products.id, jobs.productId))
    .leftJoin(jobStages, eq(jobStages.jobId, jobs.id))
    .where(visibleStages ? inArray(jobStages.stage, visibleStages) : undefined)
    .orderBy(asc(jobs.createdAt), asc(jobs.id));

  return {
    jobs: rows.map(mapJobSummary),
  };
}

export async function getJob({ db, access, id }: { db: Db; access: UserAccessSummary; id: UUID }): Promise<JobDetail> {
  return readJobDetail({ access, db, id });
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
    },
  });
}

async function readJobDetail({
  db,
  id,
  access,
}: {
  db: Db | DatabaseTransaction;
  id: UUID;
  access: UserAccessSummary;
}): Promise<JobDetail> {
  const rows = await db
    .select({
      job: jobs,
      productModelCode: products.modelCode,
      productName: products.name,
      stage: jobStages,
    })
    .from(jobs)
    .innerJoin(products, eq(products.id, jobs.productId))
    .innerJoin(jobStages, eq(jobStages.jobId, jobs.id))
    .where(eq(jobs.id, id))
    .orderBy(asc(jobStages.sequence));

  const firstRow = rows[0];
  const jobRow = firstRow?.job;

  if (!jobRow) {
    throw new JobNotFoundError(id);
  }

  return {
    ...mapJobSummary({
      ...jobRow,
      productModelCode: firstRow.productModelCode,
      productName: firstRow.productName,
    }),
    stages: rows.map((row, index) =>
      mapStageAccess({
        access,
        job: row.job,
        previousStage: index === 0 ? null : (rows[index - 1]?.stage ?? null),
        stage: row.stage,
      }),
    ),
  };
}

function mapJobSummary(row: JobWithProductRow): JobSummary {
  return {
    ...mapJob(row),
    productModelCode: row.productModelCode,
    productName: row.productName,
  };
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
      ...mapJobStage(stage),
      access: 'visible',
      department: stage.stage,
      transitionAvailability: getStageTransitionAvailability({
        access,
        job,
        previousStage,
        stage,
      }),
    };
  }

  return {
    access: 'locked',
    department: stage.stage,
    sequence: stage.sequence,
    stage: stage.stage,
  };
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

    return readJobDetail({ access, db: tx, id });
  });
}

async function readStageTransitionTarget({
  db,
  id,
  stage,
}: {
  db: DatabaseTransaction;
  id: UUID;
  stage: JobStageName;
}): Promise<{
  job: Pick<JobRow, 'lifecycleStatus'>;
  previousStage: JobStageRow | null;
  stage: JobStageRow;
}> {
  const rows = await db
    .select({
      job: jobs,
      stage: jobStages,
    })
    .from(jobs)
    .innerJoin(jobStages, eq(jobStages.jobId, jobs.id))
    .where(eq(jobs.id, id))
    .orderBy(asc(jobStages.sequence));

  const currentStageIndex = rows.findIndex((row) => row.stage.stage === stage);
  const currentStage = rows[currentStageIndex]?.stage;

  if (!currentStage) {
    throw new JobNotFoundError(id);
  }

  return {
    job: rows[currentStageIndex]?.job ?? rows[0]?.job ?? { lifecycleStatus: 'active' },
    previousStage: currentStageIndex > 0 ? (rows[currentStageIndex - 1]?.stage ?? null) : null,
    stage: currentStage,
  };
}

function getVisibleStages(access: UserAccessSummary): JobStageName[] | null {
  const visibleStages = JOB_STAGE_PIPELINE.filter(({ stage }) => canViewStage(access, { stage })).map(
    ({ stage }) => stage,
  );

  if (visibleStages.length === JOB_STAGE_PIPELINE.length) {
    return null;
  }

  return visibleStages;
}
