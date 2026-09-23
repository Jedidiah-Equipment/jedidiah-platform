import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import { canComplete, computeDieselAmount, type JobActor, transitionJob } from '@pkg/domain/contracting';
import type { JobCancelInput, JobCompleteInput, JobCreateInput, JobPatchInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { deletePlannedAssignment } from './assignment-service.js';
import { jobDescriptor } from './job-audit.js';
import { assertJobAction, JobError, jobNotFound, withJobConstraints } from './job-errors.js';
import { lockJob } from './job-lock.js';
import { assignmentIn, getJob } from './job-read.js';
import { writeJob } from './job-write.js';

type Row = typeof contractingJobs.$inferSelect;

export async function createJob({ db, actor, input }: { db: Db; actor: JobActor; input: JobCreateInput }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const [row] = await tx.insert(contractingJobs).values(input).returning();
      if (!row) throw new Error('Job insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId: actor.userId, descriptor: jobDescriptor, input: row });
      return getJob({ db: tx, id: row.id });
    }),
  );
}

export async function patchJob({ db, actor, input }: { db: Db; actor: JobActor; input: JobPatchInput }) {
  return withJobConstraints(() =>
    writeJob(db, actor.userId, input.id, {
      assert: (_tx, before) => {
        const changesSetup =
          input.customerId !== undefined ||
          input.farmId !== undefined ||
          input.workTypeId !== undefined ||
          input.description !== undefined ||
          input.foremanUserId !== undefined;
        if (changesSetup) assertJobAction('editSetup', before, actor);
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
      },
      set: (before) => ({
        customerId: input.customerId ?? before.customerId,
        farmId: input.farmId ?? before.farmId,
        workTypeId: input.workTypeId ?? before.workTypeId,
        description: input.description === undefined ? before.description : input.description,
        foremanUserId: input.foremanUserId === undefined ? before.foremanUserId : input.foremanUserId,
        notes: input.notes === undefined ? before.notes : input.notes,
        startDate: input.startDate ?? before.startDate,
        endDate: input.endDate ?? before.endDate,
        dieselLitres: input.dieselLitres ?? before.dieselLitres,
        ...repricedDiesel(before, input.dieselLitres),
      }),
    }),
  );
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

export async function cancelJob({ db, actor, input }: { db: Db; actor: JobActor; input: JobCancelInput }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const before = await lockJob(tx, input.id);
      assertJobAction('cancel', before, actor);
      const onSite = (await lockAssignments(tx, before.id)).filter(
        (assignment) => assignment.arrivalReadingId !== null && assignment.departureReadingId === null,
      ).length;
      if (onSite) throw onSiteRefusal(onSite, 'Capture their departure readings before cancelling.');
      const now = new Date();
      const [cancelled] = await tx
        .update(contractingJobs)
        .set({
          ...transitionJob(before, { type: 'cancel', at: now, byUserId: actor.userId, reason: input.reason }),
          updatedAt: now,
        })
        .where(eq(contractingJobs.id, input.id))
        .returning();
      if (!cancelled) throw jobNotFound();
      await recordAuditDelete({ db: tx, actorUserId: actor.userId, descriptor: jobDescriptor, input: cancelled });
      return getJob({ db: tx, id: cancelled.id });
    }),
  );
}

export async function completeJob({ db, actor, input }: { db: Db; actor: JobActor; input: JobCompleteInput }) {
  return withJobConstraints(() =>
    writeJob(db, actor.userId, input.id, {
      assert: async (tx, before) => {
        assertJobAction('complete', before, actor);
        const locked = await lockAssignments(tx, before.id);
        const detail = await getJob({ db: tx, id: before.id });
        const gate = canComplete(detail.assignments);
        if (!gate.ok && gate.onSite) throw onSiteRefusal(gate.onSite, 'Capture their departure readings first.');
        if (!gate.ok && gate.openGapFlags)
          throw new JobError('contracting_job.open_gap_flags', 'Resolve every Gap Flag before completing.');
        // The pricer confirmed exactly these planned stints; anything else means the plan moved underneath them.
        const planned = locked.filter((stint) => stint.arrivalReadingId === null);
        const requested = new Set(input.removePlannedAssignmentIds);
        if (
          requested.size !== input.removePlannedAssignmentIds.length ||
          requested.size !== planned.length ||
          planned.some((stint) => !requested.has(stint.id))
        )
          throw new JobError(
            'contracting_job.stint_not_planned',
            'The planned stints changed. Reload and complete again.',
          );
        for (const stint of planned)
          await deletePlannedAssignment(tx, actor.userId, stint, assignmentIn(detail, stint.id).machineCode);
      },
      set: (before) => ({
        ...transitionJob(before, {
          type: 'complete',
          at: new Date(),
          byUserId: actor.userId,
          startDate: input.startDate,
          endDate: input.endDate,
        }),
        dieselLitres: input.dieselLitres,
        notes: input.notes,
      }),
    }),
  );
}
