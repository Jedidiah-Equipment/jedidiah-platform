import { type DatabaseTransaction, jobs } from '@pkg/db';
import { isJobCancelled } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { JobCancelledError, JobNotFoundError } from './job-errors.js';
import type { JobRow } from './job-mappers.js';

export async function lockMutableJob(tx: DatabaseTransaction, jobId: UUID): Promise<JobRow> {
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for('update');

  if (!job) {
    throw new JobNotFoundError(jobId);
  }

  assertJobIsMutable(job);
  return job;
}

export function assertJobIsMutable(job: Pick<JobRow, 'cancelledAt' | 'id'>): void {
  if (isJobCancelled(job)) {
    throw new JobCancelledError(job.id);
  }
}
