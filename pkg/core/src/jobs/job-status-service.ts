import { type DatabaseTransaction, type Db, jobEvents, jobs } from '@pkg/db';
import { hasPermission } from '@pkg/domain';
import type { AuthId, JobDetail, JobSetStatusInput, UserAccessSummary, UUID } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { createAuditChanges, insertAuditEvent, jobAuditDescriptor } from '../audit/audit-service.js';
import { JobNotFoundError, JobStatusUpdateDeniedError } from './job-errors.js';
import { mapJobAuditRecord } from './job-mappers.js';
import { getJob } from './job-read-service.js';

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
  if (!hasPermission(access, 'job:update')) {
    throw new JobStatusUpdateDeniedError('You do not have permission to update job status.');
  }

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
    await insertJobStatusChangedEvent({
      actorUserId,
      from: beforeJob.status,
      jobId: updatedJob.id,
      to: updatedJob.status,
      tx,
    });

    return getJob({ access, db: tx, id: updatedJob.id });
  });
}

async function readJobForUpdate(id: UUID, tx: DatabaseTransaction) {
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, id)).for('update');

  if (!job) {
    throw new JobNotFoundError(id);
  }

  return job;
}

async function insertJobStatusChangedEvent({
  actorUserId,
  from,
  jobId,
  to,
  tx,
}: {
  actorUserId: AuthId;
  from: JobSetStatusInput['status'];
  jobId: UUID;
  to: JobSetStatusInput['status'];
  tx: DatabaseTransaction;
}): Promise<void> {
  await tx.insert(jobEvents).values({
    actorUserId,
    eventType: 'job.status-changed',
    jobId,
    occurredAt: new Date(),
    payload: { from, to },
    stageId: null,
  });
}
