import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingMachineAssignments, contractingMachines } from '@pkg/db/contracting';
import { assignmentState, type JobActor, jobTransitions, judgeAssignmentRemoval } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import type { AssignmentPatchInput, AssignmentPlanInput, AssignmentRemoveInput } from '@pkg/schema/contracting';
import { and, eq, isNotNull } from 'drizzle-orm';
import { recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { assignmentDescriptor } from './job-audit.js';
import { assertJobAction, assertStintVerdict, JobError, judgeStintAction } from './job-errors.js';
import { lockAssignment, lockJobFor, lockStintFor } from './job-lock.js';
import { jobTransaction, writeAssignment, writeJobRow } from './job-write.js';
import { reopenPricingWithin } from './pricing-service.js';

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
    const { id, ...resources } = input;
    if (resources.implementId === undefined && resources.driverUserId === undefined) {
      assertJobAction('assign', (await lockAssignment(tx, id)).job, actor);
      return;
    }
    assertStintVerdict('changeResources', await changeStintResources(tx, actor, id, resources));
  });
}

/**
 * Changes a stint's Implement and Driver inside the caller's transaction when its `changeResources` verdict allows (an
 * omitted one keeps its value), and returns that verdict, so a caller with other writes may let them land on a refusal.
 */
export async function changeStintResources(
  tx: DatabaseTransaction,
  actor: JobActor,
  id: string,
  resources: Omit<AssignmentPatchInput, 'id'>,
) {
  const { job, stint, machineCode } = await lockAssignment(tx, id);
  const verdict = judgeStintAction('changeResources', job, stint, actor);
  if (verdict.allowed)
    await writeAssignment(tx, actor.userId, machineCode, id, (before) => ({
      implementId: resources.implementId === undefined ? before.implementId : resources.implementId,
      driverUserId: resources.driverUserId === undefined ? before.driverUserId : resources.driverUserId,
    }));
  return verdict;
}

/** Deletes a Machine Assignment whose Job the caller has already locked and checked; its Measures and dismissals cascade. */
export async function deleteAssignment(
  tx: DatabaseTransaction,
  actorUserId: AuthId,
  stint: Row,
  machineCode: string,
  reason?: string,
): Promise<void> {
  await tx.delete(contractingMachineAssignments).where(eq(contractingMachineAssignments.id, stint.id));
  await recordAuditDelete({
    db: tx,
    actorUserId,
    descriptor: assignmentDescriptor(machineCode),
    input: stint,
    ...(reason ? { summary: `Removed Machine Assignment "${machineCode}": ${reason}` } : {}),
  });
}

/**
 * Removes one Machine Assignment in any state, with a reason once it has arrived. A Priced Job returns to Completed
 * for re-pricing, and an Active Job whose only arrival this was returns to Upcoming. Nothing else recomputes.
 */
export async function removeAssignment({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: AssignmentRemoveInput;
}): Promise<void> {
  await jobTransaction(db, async (tx) => {
    const { job, stint, machineCode } = await lockStintFor(tx, input.id, 'remove', actor);
    const verdict = judgeAssignmentRemoval({ state: assignmentState(stint) }, input.reason);
    if (!verdict.ok) throw new JobError(verdict.refusal.code, verdict.refusal.message);
    await deleteAssignment(tx, actor.userId, stint, machineCode, input.reason?.trim());
    if (stint.arrivalHours === null) return;
    if (job.status === 'priced')
      await reopenPricingWithin(tx, actor.userId, job.id, `${machineCode} removed — amounts recomputed.`);
    else if (job.status === 'active' && !(await anyArrival(tx, job.id)))
      await writeJobRow(tx, actor.userId, job.id, (before) => jobTransitions.deactivate(before, undefined));
  });
}

async function anyArrival(tx: DatabaseTransaction, jobId: string) {
  const [arrived] = await tx
    .select({ id: contractingMachineAssignments.id })
    .from(contractingMachineAssignments)
    .where(and(eq(contractingMachineAssignments.jobId, jobId), isNotNull(contractingMachineAssignments.arrivalHours)))
    .limit(1);
  return arrived !== undefined;
}
