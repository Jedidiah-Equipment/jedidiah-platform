import type { DatabaseTransaction } from '@pkg/db';
import { contractingJobs, contractingMachineAssignments, contractingMachines } from '@pkg/db/contracting';
import type { JobActor } from '@pkg/domain/contracting';
import type { JobActionName } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { assertJobAction, jobNotFound } from './job-errors.js';

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

/** Locks a Machine Assignment's Job, then the Assignment: the job → stint order every writer keeps. */
export async function lockAssignment(
  tx: DatabaseTransaction,
  id: string,
  notFound: () => Error = () => jobNotFound('Machine Assignment'),
) {
  const [reference] = await tx
    .select({ jobId: contractingMachineAssignments.jobId, machineCode: contractingMachines.code })
    .from(contractingMachineAssignments)
    .innerJoin(contractingMachines, eq(contractingMachines.id, contractingMachineAssignments.machineId))
    .where(eq(contractingMachineAssignments.id, id));
  if (!reference) throw notFound();
  const job = await lockJob(tx, reference.jobId);
  const [stint] = await tx
    .select()
    .from(contractingMachineAssignments)
    .where(eq(contractingMachineAssignments.id, id))
    .for('update');
  if (!stint) throw notFound();
  return { job, stint, machineCode: reference.machineCode };
}

/** Locks a Machine Assignment and its Job, and refuses unless this actor may take this Job Action on the Job now. */
export async function lockStintFor(
  tx: DatabaseTransaction,
  assignmentId: string,
  action: JobActionName,
  actor: JobActor,
) {
  const locked = await lockAssignment(tx, assignmentId);
  assertJobAction(action, locked.job, actor);
  return locked;
}
