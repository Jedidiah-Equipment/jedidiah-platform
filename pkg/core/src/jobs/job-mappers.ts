import type { jobStages, jobs } from '@pkg/db';
import { Job, JobStage } from '@pkg/schema';

export type JobRow = typeof jobs.$inferSelect;
export type JobStageRow = typeof jobStages.$inferSelect;
export type JobAuditRecord = Pick<JobRow, 'code' | 'productId' | 'productSerialNumber' | 'quoteId'>;

export function mapJob(row: JobRow): Job {
  return Job.parse({
    code: row.code,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    productId: row.productId,
    productSerialNumber: row.productSerialNumber,
    productSerialPrefix: row.productSerialPrefix,
    productSerialSequence: row.productSerialSequence,
    productSerialYear: row.productSerialYear,
    quoteId: row.quoteId,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function mapJobAuditRecord(job: JobAuditRecord): JobAuditRecord {
  return {
    code: job.code,
    productId: job.productId,
    productSerialNumber: job.productSerialNumber,
    quoteId: job.quoteId,
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
