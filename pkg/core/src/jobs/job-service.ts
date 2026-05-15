import { type DatabaseTransaction, type Db, jobStages, jobs, products } from '@pkg/db';
import { canViewStage } from '@pkg/domain';
import {
  type AuthId,
  JOB_STAGES,
  type Job,
  type JobCreateInput,
  type JobDetail,
  type JobListInput,
  type JobListResult,
  type JobStage,
  type JobStageName,
  type JobStageRollup,
  type JobSummary,
  type UserAccessSummary,
  type UUID,
} from '@pkg/schema';
import { asc, eq, inArray } from 'drizzle-orm';

import { insertAuditEvent, jobAuditDescriptor } from '../audit/audit-service.js';
import { JobNotFoundError } from './job-errors.js';

const PIPELINE = JOB_STAGES.map((stage, index) => ({
  sequence: index + 1,
  stage,
}));

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
  return {
    completedAt: row.completedAt?.toISOString() ?? null,
    id: row.id,
    jobId: row.jobId,
    sequence: row.sequence,
    stage: row.stage,
    startedAt: row.startedAt?.toISOString() ?? null,
    status: row.status,
  };
}

export async function createJob({
  db,
  input,
  actorUserId,
}: {
  db: Db;
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
      PIPELINE.map(({ sequence, stage }) => ({
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

    return readJobDetail({ db: tx, id: job.id });
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
  const detail = await readJobDetail({ db, id });

  return {
    ...detail,
    stages: detail.stages.map((stage) => mapStageAccess(access, stage)),
  };
}

async function readJobDetail({ db, id }: { db: Db | DatabaseTransaction; id: UUID }): Promise<JobDetail> {
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
    stages: rows.map((row) => ({
      ...mapJobStage(row.stage),
      access: 'visible',
      department: row.stage.stage,
    })),
  };
}

function mapJobSummary(row: JobWithProductRow): JobSummary {
  return {
    ...mapJob(row),
    productModelCode: row.productModelCode,
    productName: row.productName,
  };
}

function mapStageAccess(access: UserAccessSummary, stage: JobStageRollup): JobStageRollup {
  if (stage.access === 'locked' || canViewStage(access, stage)) {
    return stage;
  }

  return {
    access: 'locked',
    department: stage.department,
    sequence: stage.sequence,
    stage: stage.stage,
  };
}

function getVisibleStages(access: UserAccessSummary): JobStageName[] | null {
  const visibleStages = JOB_STAGES.filter((stage) => canViewStage(access, { stage }));

  if (visibleStages.length === JOB_STAGES.length) {
    return null;
  }

  return visibleStages;
}
