import type { jobStages, jobs } from '@pkg/db';
import { Job, JobStage } from '@pkg/schema';

export type JobRow = typeof jobs.$inferSelect;
export type JobStageRow = typeof jobStages.$inferSelect;
export type JobAuditRecord = Pick<JobRow, 'code' | 'dueDate' | 'productId' | 'quoteId' | 'status'>;

export function mapJob(row: JobRow): Job {
  return Job.parse({
    code: row.code,
    createdAt: row.createdAt.toISOString(),
    dueDate: row.dueDate,
    id: row.id,
    productId: row.productId,
    quoteId: row.quoteId,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function mapJobAuditRecord(job: JobAuditRecord): JobAuditRecord {
  return {
    code: job.code,
    dueDate: job.dueDate,
    productId: job.productId,
    quoteId: job.quoteId,
    status: job.status,
  };
}

export function mapJobStage(row: JobStageRow): JobStage {
  return JobStage.parse({
    id: row.id,
    jobId: row.jobId,
    sequence: row.sequence,
    stage: row.stage,
    state: 'pending',
  });
}
