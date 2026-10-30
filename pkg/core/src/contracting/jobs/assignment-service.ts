import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingMachineAssignments, contractingMachines } from '@pkg/db/contracting';
import type { JobActor } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import type { AssignmentPatchInput, AssignmentPlanInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { assignmentDescriptor } from './job-audit.js';
import { assertAssignmentState, assertJobAction, assertStintAction, JobError } from './job-errors.js';
import { lockAssignment, lockJobFor, lockStintFor } from './job-lock.js';
import { jobTransaction, writeAssignment } from './job-write.js';

type Row = typeof contractingMachineAssignments.$inferSelect;

export async function createAssignment({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: AssignmentPlanInput;
}): Promise<void> {
  await jobTransaction(db, async (tx) => {
    await lockJobFor(tx, input.jobId, 'assign', actor);
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
  });
}

export async function patchAssignment({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: AssignmentPatchInput;
}): Promise<void> {
  await jobTransaction(db, async (tx) => {
    const { job, stint, machineCode } = await lockAssignment(tx, input.id);
    const changesResources = input.implementId !== undefined || input.driverUserId !== undefined;
    if (changesResources) assertStintAction('changeResources', job, stint, actor);
    else assertJobAction('assign', job, actor);
    await writeAssignment(tx, actor.userId, machineCode, input.id, (before) => ({
      implementId: input.implementId === undefined ? before.implementId : input.implementId,
      driverUserId: input.driverUserId === undefined ? before.driverUserId : input.driverUserId,
    }));
  });
}

/** Deletes a planned Machine Assignment whose Job the caller has already locked and checked. */
export async function deletePlannedAssignment(
  tx: DatabaseTransaction,
  actorUserId: AuthId,
  stint: Row,
  machineCode: string,
): Promise<void> {
  assertAssignmentState('remove', stint);
  await tx.delete(contractingMachineAssignments).where(eq(contractingMachineAssignments.id, stint.id));
  await recordAuditDelete({ db: tx, actorUserId, descriptor: assignmentDescriptor(machineCode), input: stint });
}

export async function removeAssignment({ db, actor, id }: { db: Db; actor: JobActor; id: string }): Promise<void> {
  await jobTransaction(db, async (tx) => {
    const { stint, machineCode } = await lockStintFor(tx, id, 'remove', actor);
    await deletePlannedAssignment(tx, actor.userId, stint, machineCode);
  });
}
