import type { DatabaseTransaction } from '@pkg/db';
import { contractingJobs } from '@pkg/db/contracting';
import { eq } from 'drizzle-orm';
import { jobNotFound } from './job-errors.js';

export async function lockJob(tx: DatabaseTransaction, id: string) {
  const [job] = await tx.select().from(contractingJobs).where(eq(contractingJobs.id, id)).for('update');
  if (!job) throw jobNotFound();
  return job;
}
