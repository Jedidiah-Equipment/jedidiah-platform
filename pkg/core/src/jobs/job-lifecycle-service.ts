import { type DatabaseTransaction, jobEvents, jobs } from '@pkg/db';
import type { AuthId, JobEvent, UUID } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { createAuditChanges, insertAuditEvent, jobAuditDescriptor } from '../audit/audit-service.js';
import { JobNotFoundError } from './job-errors.js';
import { deriveJobLifecycleStatus, type JobAuditRecord, mapJobAuditRecord } from './job-mappers.js';

type WriteJobLifecycleChangeInput = {
  actorUserId: AuthId;
  before: JobAuditRecord;
  changes: Partial<Record<keyof JobAuditRecord, string>>;
  eventType: Extract<JobEvent['eventType'], `job.${string}`>;
  id: UUID;
  tx: DatabaseTransaction;
  values: Partial<typeof jobs.$inferInsert>;
};

export async function pauseJobLifecycle({
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
  await writeJobLifecycleFlagChange({
    actorUserId,
    before,
    eventType: 'job.paused',
    field: 'isPaused',
    id,
    tx,
    value: true,
  });
}

export async function resumeJobLifecycle({
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
  await writeJobLifecycleFlagChange({
    actorUserId,
    before,
    eventType: 'job.resumed',
    field: 'isPaused',
    id,
    tx,
    value: false,
  });
}

export async function cancelJobLifecycle({
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
  await writeJobLifecycleFlagChange({
    actorUserId,
    before,
    eventType: 'job.cancelled',
    field: 'isCancelled',
    id,
    tx,
    value: true,
  });
}

export async function uncancelJobLifecycle({
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
  await writeJobLifecycleFlagChange({
    actorUserId,
    before,
    eventType: 'job.uncancelled',
    field: 'isCancelled',
    id,
    tx,
    value: false,
  });
}

async function writeJobLifecycleFlagChange({
  actorUserId,
  before,
  eventType,
  field,
  id,
  tx,
  value,
}: {
  actorUserId: AuthId;
  before: JobAuditRecord;
  eventType: Extract<JobEvent['eventType'], `job.${string}`>;
  field: 'isCancelled' | 'isPaused';
  id: UUID;
  tx: DatabaseTransaction;
  value: boolean;
}): Promise<void> {
  await writeJobLifecycleChange({
    actorUserId,
    before,
    changes: {
      [field]: jobAuditDescriptor.fields[field] ?? field,
    },
    eventType,
    id,
    tx,
    values: {
      [field]: value,
      updatedAt: new Date(),
    },
  });
}

async function writeJobLifecycleChange({
  actorUserId,
  before,
  changes,
  eventType,
  id,
  tx,
  values,
}: WriteJobLifecycleChangeInput): Promise<void> {
  const [updatedJob] = await tx.update(jobs).set(values).where(eq(jobs.id, id)).returning();

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
      changes: createAuditChanges(before, after, changes),
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
      fromLifecycleStatus: deriveJobLifecycleStatus({
        actualEnd: null,
        actualStart: null,
        isCancelled: before.isCancelled,
        isPaused: before.isPaused,
      }),
      toLifecycleStatus: deriveJobLifecycleStatus({
        actualEnd: null,
        actualStart: null,
        isCancelled: updatedJob.isCancelled,
        isPaused: updatedJob.isPaused,
      }),
    },
    stageId: null,
  });
}
