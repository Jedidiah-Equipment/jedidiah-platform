import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { assignmentDescriptor, jobDescriptor } from './job-audit.js';
import { jobNotFound, withJobConstraints } from './job-errors.js';

type JobRow = typeof contractingJobs.$inferSelect;
type AssignmentRow = typeof contractingMachineAssignments.$inferSelect;

/** The shell of every Job write: the constraint translations around one transaction. */
export const jobTransaction = <T>(db: Db, fn: (tx: DatabaseTransaction) => Promise<T>) =>
  withJobConstraints(() => db.transaction(fn));

/** One audited write to a Job row its caller has locked, returning the written row. */
export function writeJobRow(
  tx: DatabaseTransaction,
  actorUserId: AuthId,
  id: string,
  set: (before: JobRow) => Partial<typeof contractingJobs.$inferInsert>,
) {
  return mutateEntity({
    db: tx,
    actorUserId,
    descriptor: jobDescriptor,
    table: contractingJobs,
    id,
    notFound: jobNotFound,
    set: (before) => ({ ...set(before), updatedAt: new Date() }),
    project: (_tx, row) => row,
  });
}

/** One audited write to a Machine Assignment row its caller has locked, returning the written row. */
export function writeAssignment(
  tx: DatabaseTransaction,
  actorUserId: AuthId,
  machineCode: string,
  id: string,
  set: (before: AssignmentRow) => Partial<typeof contractingMachineAssignments.$inferInsert>,
) {
  return mutateEntity({
    db: tx,
    actorUserId,
    descriptor: assignmentDescriptor(machineCode),
    table: contractingMachineAssignments,
    id,
    notFound: () => jobNotFound('Machine Assignment'),
    set: (before) => ({ ...set(before), updatedAt: new Date() }),
    project: (_tx, row) => row,
  });
}
