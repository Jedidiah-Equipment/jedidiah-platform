import type { DatabaseTransaction } from '@pkg/db';
import { contractingJobs, contractingMachineAssignments, contractingMachines } from '@pkg/db/contracting';
import type { JobActor } from '@pkg/domain/contracting';
import type { AssignmentActionName, JobActionName } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { assertJobAction, assertStintAction, jobNotFound } from './job-errors.js';

export async function lockJob(tx: DatabaseTransaction, id: string) {
  const [job] = await tx.select().from(contractingJobs).where(eq(contractingJobs.id, id)).for('update');
  if (!job) throw jobNotFound();
  return job;
}

/** Locks a Job and refuses unless this actor may take this Job Action on it now. */
export async function lockJobFor(tx: DatabaseTransaction, id: string, action: JobActionName, actor: JobActor) {
  const job = await lockJob(tx, id);
  assertJobAction(action, job, actor);
  return job;
}

const assignmentNotFound = () => jobNotFound('Machine Assignment');

async function assignmentReference(tx: DatabaseTransaction, id: string) {
  const [reference] = await tx
    .select({
      jobId: contractingMachineAssignments.jobId,
      machineId: contractingMachineAssignments.machineId,
      machineCode: contractingMachines.code,
    })
    .from(contractingMachineAssignments)
    .innerJoin(contractingMachines, eq(contractingMachines.id, contractingMachineAssignments.machineId))
    .where(eq(contractingMachineAssignments.id, id));
  if (!reference) throw assignmentNotFound();
  return reference;
}

async function lockReferencedAssignment(
  tx: DatabaseTransaction,
  id: string,
  reference: Awaited<ReturnType<typeof assignmentReference>>,
) {
  const job = await lockJob(tx, reference.jobId);
  const [stint] = await tx
    .select()
    .from(contractingMachineAssignments)
    .where(eq(contractingMachineAssignments.id, id))
    .for('update');
  if (!stint) throw assignmentNotFound();
  return { job, stint, machineCode: reference.machineCode };
}

/** Locks a Machine Assignment's Job, then the Assignment: the job → stint order every writer keeps. */
export async function lockAssignment(tx: DatabaseTransaction, id: string) {
  return lockReferencedAssignment(tx, id, await assignmentReference(tx, id));
}

/** Locks the Assignment's Machine first, then its Job and the Assignment: the machine → job → stint order. */
export async function lockAssignmentWithMachine(tx: DatabaseTransaction, id: string) {
  const reference = await assignmentReference(tx, id);
  const [machine] = await tx
    .select()
    .from(contractingMachines)
    .where(eq(contractingMachines.id, reference.machineId))
    .for('update');
  if (!machine) throw jobNotFound('Machine');
  return { ...(await lockReferencedAssignment(tx, id, reference)), machine };
}

/** Locks a Machine Assignment and its Job, and refuses unless this actor may take this Assignment Action on it now. */
export async function lockStintFor(
  tx: DatabaseTransaction,
  assignmentId: string,
  action: AssignmentActionName,
  actor: JobActor,
) {
  const locked = await lockAssignment(tx, assignmentId);
  assertStintAction(action, locked.job, locked.stint, actor);
  return locked;
}
