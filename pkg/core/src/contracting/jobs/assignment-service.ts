import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingMachineAssignments, contractingMachines } from '@pkg/db/contracting';
import { formatHours } from '@pkg/domain';
import { round1 } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import {
  type AssignmentPatchInput,
  type AssignmentPlanInput,
  closedJobStatuses,
  type GapResolveInput,
  hasJobStatus,
  openJobStatuses,
  workedJobStatuses,
} from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { assignmentDescriptor } from './job-audit.js';
import { assertOwner, JobError, withJobConstraints, wrongStatus } from './job-errors.js';
import { lockAssignment, lockJob } from './job-lock.js';
import { assignmentIn, getJob } from './job-read.js';
import { writeAssignment } from './job-write.js';

type Row = typeof contractingMachineAssignments.$inferSelect;

/**
 * Who is changing a Machine Assignment. A manager works any open Job; a Foreman works only their own, and
 * changes an existing stint only while the Job is Active.
 */
export type AssignmentActor = 'manager' | 'foreman';

export async function createAssignment({
  db,
  actorUserId,
  actingAs,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  actingAs: AssignmentActor;
  input: AssignmentPlanInput;
}) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const job = await lockJob(tx, input.jobId);
      if (!hasJobStatus(openJobStatuses, job.status))
        throw wrongStatus('Machine Assignments can only be added to an Upcoming or Active Job.');
      if (actingAs === 'foreman') assertOwner(job, actorUserId);
      const [machine] = await tx
        .select({ code: contractingMachines.code, currentDriverUserId: contractingMachines.currentDriverUserId })
        .from(contractingMachines)
        .where(eq(contractingMachines.id, input.machineId));
      if (!machine) throw new JobError('contracting_job.invalid_reference', 'Machine not found.');
      const [row] = await tx
        .insert(contractingMachineAssignments)
        .values({
          ...input,
          driverUserId: input.driverUserId === undefined ? machine.currentDriverUserId : input.driverUserId,
          createdByUserId: actorUserId,
        })
        .returning();
      if (!row) throw new Error('Machine Assignment insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor: assignmentDescriptor(machine.code), input: row });
      return assignmentIn(await getJob({ db: tx, id: job.id }), row.id);
    }),
  );
}

export async function patchAssignment({
  db,
  actorUserId,
  actingAs,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  actingAs: AssignmentActor;
  input: AssignmentPatchInput;
}) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const { job, machineCode } = await lockAssignment(tx, input.id);
      await writeAssignment(tx, actorUserId, machineCode, input.id, {
        assert: (_tx, before) => {
          if (actingAs === 'foreman') {
            assertOwner(job, actorUserId);
            if (job.status !== 'active') throw wrongStatus('Foremen can change stints only while the Job is Active.');
          }
          if (hasJobStatus(closedJobStatuses, job.status))
            throw wrongStatus('A Cancelled or Invoiced Job cannot be changed.');
          if (
            input.travelIncluded !== undefined &&
            input.travelIncluded !== before.travelIncluded &&
            job.status === 'priced'
          )
            throw wrongStatus('This Job is Priced, so its travel can no longer change.');
          if (
            (input.implementId !== undefined || input.driverUserId !== undefined) &&
            before.departureReadingId !== null
          )
            throw wrongStatus('The Implement and Driver cannot change after the Machine has left.');
        },
        set: (before) => ({
          implementId: input.implementId === undefined ? before.implementId : input.implementId,
          driverUserId: input.driverUserId === undefined ? before.driverUserId : input.driverUserId,
          travelIncluded: input.travelIncluded ?? before.travelIncluded,
        }),
      });
      return assignmentIn(await getJob({ db: tx, id: job.id }), input.id);
    }),
  );
}

/** Deletes a planned Machine Assignment whose Job the caller has already locked and checked. */
export async function deletePlannedAssignment(
  tx: DatabaseTransaction,
  actorUserId: AuthId,
  stint: Row,
  machineCode: string,
) {
  if (stint.arrivalReadingId)
    throw new JobError('contracting_job.stint_not_planned', 'Only a planned Machine Assignment can be removed.');
  await tx.delete(contractingMachineAssignments).where(eq(contractingMachineAssignments.id, stint.id));
  await recordAuditDelete({ db: tx, actorUserId, descriptor: assignmentDescriptor(machineCode), input: stint });
  return stint;
}

export async function removeAssignment({ db, actorUserId, id }: { db: Db; actorUserId: AuthId; id: string }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const { job, stint, machineCode } = await lockAssignment(tx, id);
      if (!hasJobStatus(openJobStatuses, job.status))
        throw wrongStatus('Machine Assignments can only be removed from an Upcoming or Active Job.');
      return deletePlannedAssignment(tx, actorUserId, stint, machineCode);
    }),
  );
}

export async function resolveGap({ db, actorUserId, input }: { db: Db; actorUserId: AuthId; input: GapResolveInput }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const { job, machineCode } = await lockAssignment(tx, input.id);
      if (!hasJobStatus(workedJobStatuses, job.status))
        throw wrongStatus('Hour Gaps can only be resolved on an Active or Completed Job.');
      await writeAssignment(tx, actorUserId, machineCode, input.id, {
        assert: async (innerTx, before) => {
          if (!before.arrivalReadingId || !before.departureReadingId)
            throw new JobError('contracting_job.stint_not_on_site', 'The Machine Assignment must have left the Job.');
          const { gapHours } = assignmentIn(await getJob({ db: innerTx, id: job.id }), before.id);
          if (gapHours === null)
            throw new JobError('contracting_job.invalid_reference', 'This Machine Assignment has no Hour Gap.');
          if (round1(input.travelHours + input.unaccountedHours) !== gapHours)
            throw new JobError(
              'contracting_job.invalid_reference',
              `Travel Hours and the Unaccounted Interval must total ${formatHours(gapHours)}.`,
            );
        },
        set: () => ({
          gapTravelHours: input.travelHours,
          gapUnaccountedHours: input.unaccountedHours,
          gapReason: input.reason,
          gapResolvedAt: new Date(),
          gapResolvedByUserId: actorUserId,
        }),
      });
      return assignmentIn(await getJob({ db: tx, id: job.id }), input.id);
    }),
  );
}
