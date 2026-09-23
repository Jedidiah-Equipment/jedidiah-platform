import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingMachineAssignments, contractingMachines } from '@pkg/db/contracting';
import { formatHours } from '@pkg/domain';
import { type JobActor, round1 } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import type { AssignmentPatchInput, AssignmentPlanInput, GapResolveInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { assignmentDescriptor } from './job-audit.js';
import { assertJobAction, JobError, withJobConstraints, wrongStatus } from './job-errors.js';
import { lockAssignment, lockJob } from './job-lock.js';
import { assignmentIn, getJob } from './job-read.js';
import { writeAssignment } from './job-write.js';

type Row = typeof contractingMachineAssignments.$inferSelect;

export async function createAssignment({ db, actor, input }: { db: Db; actor: JobActor; input: AssignmentPlanInput }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const job = await lockJob(tx, input.jobId);
      assertJobAction('assign', job, actor);
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
          createdByUserId: actor.userId,
        })
        .returning();
      if (!row) throw new Error('Machine Assignment insert returned no row');
      await recordAuditCreate({
        db: tx,
        actorUserId: actor.userId,
        descriptor: assignmentDescriptor(machine.code),
        input: row,
      });
      return assignmentIn(await getJob({ db: tx, id: job.id }), row.id);
    }),
  );
}

export async function patchAssignment({ db, actor, input }: { db: Db; actor: JobActor; input: AssignmentPatchInput }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const { job, machineCode } = await lockAssignment(tx, input.id);
      await writeAssignment(tx, actor.userId, machineCode, input.id, {
        assert: (_tx, before) => {
          const changesResources = input.implementId !== undefined || input.driverUserId !== undefined;
          const changesTravel = input.travelIncluded !== undefined && input.travelIncluded !== before.travelIncluded;
          if (changesResources || !changesTravel) assertJobAction('assign', job, actor);
          if (changesTravel) assertJobAction('patchTravel', job, actor);
          // Judges the stint, not the Job: what a Machine brought is history once it has left.
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

export async function removeAssignment({ db, actor, id }: { db: Db; actor: JobActor; id: string }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const { job, stint, machineCode } = await lockAssignment(tx, id);
      assertJobAction('assign', job, actor);
      return deletePlannedAssignment(tx, actor.userId, stint, machineCode);
    }),
  );
}

export async function resolveGap({ db, actor, input }: { db: Db; actor: JobActor; input: GapResolveInput }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const { job, machineCode } = await lockAssignment(tx, input.id);
      assertJobAction('resolveGaps', job, actor);
      await writeAssignment(tx, actor.userId, machineCode, input.id, {
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
          gapResolvedByUserId: actor.userId,
        }),
      });
      return assignmentIn(await getJob({ db: tx, id: job.id }), input.id);
    }),
  );
}
