import type { DatabaseTransaction } from '@pkg/db';
import { contractingJobs, contractingMachineAssignments, contractingMachines } from '@pkg/db/contracting';
import { eq } from 'drizzle-orm';
import { jobNotFound } from './job-errors.js';

export async function lockJob(tx: DatabaseTransaction, id: string, notFound: () => Error = jobNotFound) {
  const [job] = await tx.select().from(contractingJobs).where(eq(contractingJobs.id, id)).for('update');
  if (!job) throw notFound();
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
