import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { assignmentDescriptor, jobDescriptor } from './job-audit.js';
import { jobNotFound } from './job-errors.js';
import { getJob } from './job-read.js';

type JobRow = typeof contractingJobs.$inferSelect;
type AssignmentRow = typeof contractingMachineAssignments.$inferSelect;

type Write<Row, Insert> = {
  assert?: (tx: DatabaseTransaction, before: Row) => Promise<void> | void;
  set: (before: Row) => Partial<Insert>;
};

/** One audited write to a Job row, returning the written row. */
export function writeJobRow(
  db: Db | DatabaseTransaction,
  actorUserId: AuthId,
  id: string,
  { assert, set }: Write<JobRow, typeof contractingJobs.$inferInsert>,
) {
  return mutateEntity({
    db,
    actorUserId,
    descriptor: jobDescriptor,
    table: contractingJobs,
    id,
    notFound: jobNotFound,
    ...(assert ? { assert } : {}),
    set: (before) => ({ ...set(before), updatedAt: new Date() }),
    project: (_tx, row) => row,
  });
}

/** One audited write to a Job row, returning the fresh read model. */
export async function writeJob(
  db: Db | DatabaseTransaction,
  actorUserId: AuthId,
  id: string,
  write: Write<JobRow, typeof contractingJobs.$inferInsert>,
) {
  return db.transaction(async (tx) => {
    const row = await writeJobRow(tx, actorUserId, id, write);
    return getJob({ db: tx, id: row.id });
  });
}

/** One audited write to a Machine Assignment row, returning the written row. */
export function writeAssignment(
  tx: DatabaseTransaction,
  actorUserId: AuthId,
  machineCode: string,
  id: string,
  { assert, set }: Write<AssignmentRow, typeof contractingMachineAssignments.$inferInsert>,
) {
  return mutateEntity({
    db: tx,
    actorUserId,
    descriptor: assignmentDescriptor(machineCode),
    table: contractingMachineAssignments,
    id,
    notFound: () => jobNotFound('Machine Assignment'),
    ...(assert ? { assert } : {}),
    set: (before) => ({ ...set(before), updatedAt: new Date() }),
    project: (_tx, row) => row,
  });
}
