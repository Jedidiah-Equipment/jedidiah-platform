import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import {
  assignmentState,
  canComplete,
  completionGateReasons,
  computeDieselAmount,
  formatJobNumber,
  type JobActor,
  jobTransitions,
} from '@pkg/domain/contracting';
import type { JobCancelInput, JobCompleteInput, JobCreateInput, JobPatchInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { deletePlannedAssignment } from './assignment-service.js';
import { jobDescriptor } from './job-audit.js';
import { assertJobAction, JobError, jobNotFound } from './job-errors.js';
import { lockJob, lockJobFor } from './job-lock.js';
import { assignmentIn, getJob } from './job-read.js';
import { jobTransaction, writeJobRow } from './job-write.js';

type Row = typeof contractingJobs.$inferSelect;

export async function createJob({ db, actor, input }: { db: Db; actor: JobActor; input: JobCreateInput }) {
  return jobTransaction(db, async (tx) => {
    const [row] = await tx.insert(contractingJobs).values(input).returning();
    if (!row) throw new Error('Job insert returned no row');
    await recordAuditCreate({ db: tx, actorUserId: actor.userId, descriptor: jobDescriptor, input: row });
    return { id: row.id, jobNumber: formatJobNumber(row.code) };
  });
}

export async function patchJob({ db, actor, input }: { db: Db; actor: JobActor; input: JobPatchInput }): Promise<void> {
  await jobTransaction(db, async (tx) => {
    const before = await lockJob(tx, input.id);
    const changesSetup =
      input.customerId !== undefined ||
      input.farmId !== undefined ||
      input.workTypeId !== undefined ||
      input.description !== undefined ||
      input.foremanUserId !== undefined;
    if (changesSetup) assertJobAction('editSetup', before, actor);
    if (input.foremanUserId !== undefined) assertJobAction('assignForeman', before, actor);
    const changesSignOff =
      input.startDate !== undefined ||
      input.endDate !== undefined ||
      input.notes !== undefined ||
      input.dieselLitres !== undefined;
    if (changesSignOff) assertJobAction('editSignOffDetails', before, actor);
    // The sign-off form saves its litres with every edit; only a real change is a diesel edit.
    if (input.dieselLitres !== undefined && input.dieselLitres !== before.dieselLitres)
      assertJobAction('editDieselLitres', before, actor);
    const startDate = input.startDate ?? before.startDate;
    const endDate = input.endDate ?? before.endDate;
    if (startDate && endDate && startDate > endDate)
      throw new JobError('contracting_job.invalid_reference', 'End date is before start date.');
    await writeJobRow(tx, actor.userId, input.id, (row) => ({
      customerId: input.customerId ?? row.customerId,
      farmId: input.farmId ?? row.farmId,
      workTypeId: input.workTypeId ?? row.workTypeId,
      description: input.description === undefined ? row.description : input.description,
      foremanUserId: input.foremanUserId === undefined ? row.foremanUserId : input.foremanUserId,
      notes: input.notes === undefined ? row.notes : input.notes,
      startDate: input.startDate ?? row.startDate,
      endDate: input.endDate ?? row.endDate,
      dieselLitres: input.dieselLitres ?? row.dieselLitres,
      ...repricedDiesel(row, input.dieselLitres),
    }));
  });
}

/**
 * A computed Diesel amount follows the litres; an overridden one is the pricer's and stays. Litres
 * corrected to zero mean no diesel was supplied, so its price goes too.
 */
function repricedDiesel(before: Row, dieselLitres: number | undefined) {
  const kept = { dieselUnitPrice: before.dieselUnitPrice, dieselAmount: before.dieselAmount };
  if (dieselLitres === undefined || dieselLitres === before.dieselLitres) return kept;
  if (dieselLitres === 0) return { dieselUnitPrice: null, dieselAmount: null };
  if (before.dieselUnitPrice === null || before.dieselAmount === null) return kept;
  const computed = computeDieselAmount(before.dieselLitres, before.dieselUnitPrice);
  return before.dieselAmount === computed
    ? { ...kept, dieselAmount: computeDieselAmount(dieselLitres, before.dieselUnitPrice) }
    : kept;
}

/** Locks every Machine Assignment on a Job, after the Job itself. */
function lockAssignments(tx: DatabaseTransaction, jobId: string) {
  return tx
    .select()
    .from(contractingMachineAssignments)
    .where(eq(contractingMachineAssignments.jobId, jobId))
    .for('update');
}

const onSiteRefusal = (count: number, instruction: string) =>
  new JobError('contracting_job.has_on_site_stints', `${count} machine(s) are still on site. ${instruction}`);

export async function cancelJob({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: JobCancelInput;
}): Promise<void> {
  await jobTransaction(db, async (tx) => {
    const before = await lockJobFor(tx, input.id, 'cancel', actor);
    const onSite = (await lockAssignments(tx, before.id)).filter(
      (assignment) => assignmentState(assignment) === 'on-site',
    ).length;
    if (onSite) throw onSiteRefusal(onSite, 'Capture their departure readings before cancelling.');
    const now = new Date();
    const [cancelled] = await tx
      .update(contractingJobs)
      .set({
        ...jobTransitions.cancel(before, { at: now, byUserId: actor.userId, reason: input.reason }),
        updatedAt: now,
      })
      .where(eq(contractingJobs.id, input.id))
      .returning();
    if (!cancelled) throw jobNotFound();
    await recordAuditDelete({ db: tx, actorUserId: actor.userId, descriptor: jobDescriptor, input: cancelled });
  });
}

export async function completeJob({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: JobCompleteInput;
}): Promise<void> {
  await jobTransaction(db, async (tx) => {
    const before = await lockJobFor(tx, input.id, 'complete', actor);
    const locked = await lockAssignments(tx, before.id);
    const detail = await getJob({ db: tx, id: before.id });
    const gate = canComplete(detail.assignments);
    if (!gate.ok)
      throw new JobError(
        gate.onSite ? 'contracting_job.has_on_site_stints' : 'contracting_job.open_gap_flags',
        completionGateReasons(gate).join(' '),
      );
    // The pricer confirmed exactly these planned stints; anything else means the plan moved underneath them.
    const planned = locked.filter((stint) => assignmentState(stint) === 'planned');
    const requested = new Set(input.removePlannedAssignmentIds);
    if (
      requested.size !== input.removePlannedAssignmentIds.length ||
      requested.size !== planned.length ||
      planned.some((stint) => !requested.has(stint.id))
    )
      throw new JobError('contracting_job.stint_not_planned', 'The planned stints changed. Reload and complete again.');
    for (const stint of planned)
      await deletePlannedAssignment(tx, actor.userId, stint, assignmentIn(detail, stint.id).machineCode);
    await writeJobRow(tx, actor.userId, before.id, (row) => ({
      ...jobTransitions.complete(row, {
        at: new Date(),
        byUserId: actor.userId,
        startDate: input.startDate,
        endDate: input.endDate,
      }),
      dieselLitres: input.dieselLitres,
      notes: input.notes,
    }));
  });
}
