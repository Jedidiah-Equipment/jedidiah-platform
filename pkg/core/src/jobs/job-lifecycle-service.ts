import { type DatabaseTransaction, jobEvents, jobs } from '@pkg/db';
import type { AuthId, JobEvent, JobLifecycleStatus, UUID } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { createAuditChanges, insertAuditEvent, jobAuditDescriptor } from '../audit/audit-service.js';
import { JobNotFoundError } from './job-errors.js';
import { type JobAuditRecord, mapJobAuditRecord } from './job-mappers.js';

export async function completeJobLifecycle({
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

export async function applyJobLifecycleStatusChange({
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
