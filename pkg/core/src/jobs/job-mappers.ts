import type { jobEvents, jobStages, jobs, user } from '@pkg/db';
import { Job, JobEvent, JobEventDerivationStage, JobStage } from '@pkg/schema';

export type JobRow = typeof jobs.$inferSelect;
export type JobEventRow = typeof jobEvents.$inferSelect;
export type JobEventWithActorRow = JobEventRow & {
  actor: Pick<typeof user.$inferSelect, 'name'> | null;
};
export type JobStageRow = typeof jobStages.$inferSelect;
export type JobAuditRecord = Pick<JobRow, 'code' | 'dueDate' | 'lifecycleStatus' | 'productId' | 'quoteId'>;

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

export function mapJobAuditRecord(
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

export function mapJobEventWithActor(row: JobEventWithActorRow): JobEvent {
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

export function mapJobEventDerivationStage(row: JobStageRow): JobEventDerivationStage {
  return JobEventDerivationStage.parse({
    completedAt: row.completedAt?.toISOString() ?? null,
    stage: row.stage,
    startedAt: row.startedAt?.toISOString() ?? null,
    status: row.status,
  });
}
