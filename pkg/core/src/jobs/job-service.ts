import { type DatabaseTransaction, type Db, jobStages, jobs, quotes } from '@pkg/db';
import { JOB_STAGE_PIPELINE } from '@pkg/domain';
import type {
  AuthId,
  JobCreateInput,
  JobDetail,
  JobDueDateEditInput,
  JobSetStatusInput,
  UserAccessSummary,
  UUID,
} from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { createAuditChanges, insertAuditEvent, jobAuditDescriptor } from '../audit/audit-service.js';
import { JobCreateFromQuoteDeniedError, JobDateEditTargetNotFoundError, JobNotFoundError } from './job-errors.js';
import { mapJobAuditRecord } from './job-mappers.js';
import { getJob } from './job-read-service.js';

export async function createJob({
  access,
  db,
  input,
  actorUserId,
}: {
  access: UserAccessSummary;
  db: Db;
  input: JobCreateInput;
  actorUserId: AuthId;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    const quoteId = input.quoteId ?? null;

    if (quoteId) {
      await validateJobQuoteForCreate({ quoteId, tx });
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
    if (stageRows.length !== JOB_STAGE_PIPELINE.length) {
      throw new Error('Job stage insert did not return every row');
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
  });
}

async function validateJobQuoteForCreate({ quoteId, tx }: { quoteId: UUID; tx: DatabaseTransaction }): Promise<void> {
  const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for('update');

  if (!quote) {
    throw new JobCreateFromQuoteDeniedError('Quote not found.');
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

export async function setJobStatus({
  access,
  actorUserId,
  db,
  input,
}: {
  access: UserAccessSummary;
  actorUserId: AuthId;
  db: Db;
  input: JobSetStatusInput;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    const beforeJob = await readJobForUpdate(input.id, tx);

    if (beforeJob.status === input.status) {
      return getJob({ access, db: tx, id: beforeJob.id });
    }

    const [updatedJob] = await tx
      .update(jobs)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(jobs.id, input.id))
      .returning();

    if (!updatedJob) {
      throw new JobNotFoundError(input.id);
    }

    const before = mapJobAuditRecord(beforeJob);
    const after = mapJobAuditRecord(updatedJob);

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'updated',
        actorUserId,
        after,
        before,
        changes: createAuditChanges(before, after, jobAuditDescriptor.fields),
        entityId: updatedJob.id,
        entityType: jobAuditDescriptor.entityType,
      },
    });

    // TODO: Fix job event history.
    // await insertJobStatusChangedEvent({
    //   actorUserId,
    //   from: beforeJob.status,
    //   jobId: updatedJob.id,
    //   to: updatedJob.status,
    //   tx,
    // });

    return getJob({ access, db: tx, id: updatedJob.id });
  });
}

export async function editJobDueDate({
  db,
  access,
  actorUserId,
  input,
}: {
  db: Db;
  access: UserAccessSummary;
  actorUserId: AuthId;
  input: JobDueDateEditInput;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    const beforeJob = await readJobForUpdate(input.jobId, tx);
    if (beforeJob.dueDate !== input.dueDate) {
      const [updatedJob] = await tx
        .update(jobs)
        .set({ dueDate: input.dueDate, updatedAt: new Date() })
        .where(eq(jobs.id, input.jobId))
        .returning();

      if (!updatedJob) {
        throw new JobDateEditTargetNotFoundError(input.jobId);
      }

      const beforeAuditJob = mapJobAuditRecord(beforeJob);
      const afterAuditJob = mapJobAuditRecord(updatedJob);

      await insertAuditEvent({
        db: tx,
        input: {
          action: 'updated',
          actorUserId,
          after: afterAuditJob,
          before: beforeAuditJob,
          changes: createAuditChanges(beforeAuditJob, afterAuditJob, jobAuditDescriptor.fields),
          entityId: input.jobId,
          entityType: jobAuditDescriptor.entityType,
        },
      });

      // TODO: Fix job event history.
      // await insertDateOverriddenEvent({
      //   actorUserId,
      //   entityId: updatedJob.id,
      //   entityLevel: 'job',
      //   field: 'due_date',
      //   jobId: updatedJob.id,
      //   newValue: updatedJob.dueDate,
      //   oldValue: beforeJob.dueDate,
      //   stageId: null,
      //   tx,
      // });
    }

    return getJob({ access, db: tx, id: input.jobId });
  });
}

async function readJobForUpdate(id: UUID, tx: DatabaseTransaction) {
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, id)).for('update');
  if (!job) {
    throw new JobDateEditTargetNotFoundError(id);
  }
  return job;
}
