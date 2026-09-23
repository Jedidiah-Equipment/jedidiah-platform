import type { DatabaseTransaction } from '@pkg/db';
import { contractingJobs } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { jobNotFound } from './job-errors.js';
import { getJob } from './job-read.js';
import { jobDescriptor } from './job-service.js';

type JobRow = typeof contractingJobs.$inferSelect;

/** One audited write to a Job row, returning the fresh read model. */
export function writeJob(
  tx: DatabaseTransaction,
  actorUserId: AuthId,
  id: string,
  {
    assert,
    set,
  }: {
    assert?: (tx: DatabaseTransaction, before: JobRow) => Promise<void> | void;
    set: (before: JobRow) => Partial<typeof contractingJobs.$inferInsert>;
  },
) {
  return mutateEntity({
    db: tx,
    actorUserId,
    descriptor: jobDescriptor,
    table: contractingJobs,
    id,
    notFound: jobNotFound,
    ...(assert ? { assert } : {}),
    set: (before) => ({ ...set(before), updatedAt: new Date() }),
    project: (innerTx, row) => getJob({ db: innerTx, id: row.id }),
  });
}
