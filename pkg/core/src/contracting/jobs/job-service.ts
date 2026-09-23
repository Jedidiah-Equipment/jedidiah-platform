import type { Db } from '@pkg/db';
import { contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import { canComplete, computeDieselAmount, formatJobNumber } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import type { JobCancelInput, JobCompleteInput, JobCreateInput, JobPatchInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { removeAssignmentWithin } from './assignment-service.js';
import { JobError, jobNotFound, withJobConstraints, wrongStatus } from './job-errors.js';
import { lockJob } from './job-lock.js';
import { getJob } from './job-read.js';

type Row = typeof contractingJobs.$inferSelect;
export const jobDescriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_job',
  noun: 'Job',
  primaryLabelField: 'code',
  primaryLabelFormatter: (value) => formatJobNumber(Number(value)),
  entityId: (row) => row.id,
  toRecord: ({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => ({
    ...row,
    completedAt: row.completedAt?.toISOString() ?? null,
    pricedAt: row.pricedAt?.toISOString() ?? null,
    reopenedAt: row.reopenedAt?.toISOString() ?? null,
    invoicedAt: row.invoicedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  }),
});

export async function createJob({ db, actorUserId, input }: { db: Db; actorUserId: AuthId; input: JobCreateInput }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const [row] = await tx.insert(contractingJobs).values(input).returning();
      if (!row) throw new Error('Job insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor: jobDescriptor, input: row });
      return getJob({ db: tx, id: row.id });
    }),
  );
}

export async function patchJob({ db, actorUserId, input }: { db: Db; actorUserId: AuthId; input: JobPatchInput }) {
  return withJobConstraints(() =>
    mutateEntity({
      db,
      actorUserId,
      descriptor: jobDescriptor,
      table: contractingJobs,
      id: input.id,
      notFound: jobNotFound,
      assert: (_tx, before) => {
        if (before.status === 'invoiced') throw wrongStatus('An Invoiced Job cannot be changed.');
        const changesSetup =
          input.customerId !== undefined ||
          input.farmId !== undefined ||
          input.workTypeId !== undefined ||
          input.description !== undefined ||
          input.foremanUserId !== undefined;
        if (changesSetup && !['upcoming', 'active'].includes(before.status))
          throw wrongStatus('Job setup can only be changed while the Job is Upcoming or Active.');
        const changesSignOff =
          input.startDate !== undefined ||
          input.endDate !== undefined ||
          input.notes !== undefined ||
          input.dieselLitres !== undefined;
        if (changesSignOff && !['completed', 'priced'].includes(before.status))
          throw wrongStatus('Sign-off details can only be changed after Completion.');
        if (
          input.dieselLitres !== undefined &&
          input.dieselLitres !== before.dieselLitres &&
          before.status === 'priced'
        )
          throw wrongStatus('This Job is Priced, so its diesel litres can no longer change.');
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
        updatedAt: new Date(),
      }),
      project: (tx, row) => getJob({ db: tx, id: row.id }),
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

export async function cancelJob({ db, actorUserId, input }: { db: Db; actorUserId: AuthId; input: JobCancelInput }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const before = await lockJob(tx, input.id);
      if (!['upcoming', 'active', 'completed'].includes(before.status))
        throw wrongStatus('Only an Upcoming, Active, or Completed Job can be cancelled.');
      const assignments = await tx
        .select()
        .from(contractingMachineAssignments)
        .where(eq(contractingMachineAssignments.jobId, before.id))
        .for('update');
      const onSite = assignments.filter(
        (assignment) => assignment.arrivalReadingId !== null && assignment.departureReadingId === null,
      ).length;
      if (onSite)
        throw new JobError(
          'contracting_job.has_on_site_stints',
          `${onSite} machine(s) are still on site. Capture their departure readings before cancelling.`,
        );
      const now = new Date();
      const [cancelled] = await tx
        .update(contractingJobs)
        .set({
          status: 'cancelled',
          cancelledAt: now,
          cancelledByUserId: actorUserId,
          cancellationReason: input.reason,
          completedAt: null,
          completedByUserId: null,
          reopenedAt: null,
          repricingNote: null,
          updatedAt: now,
        })
        .where(eq(contractingJobs.id, input.id))
        .returning();
      if (!cancelled) throw jobNotFound();
      await recordAuditDelete({ db: tx, actorUserId, descriptor: jobDescriptor, input: cancelled });
      return getJob({ db: tx, id: cancelled.id });
    }),
  );
}

export async function completeJob({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: JobCompleteInput;
}) {
  return withJobConstraints(() =>
    mutateEntity({
      db,
      actorUserId,
      descriptor: jobDescriptor,
      table: contractingJobs,
      id: input.id,
      notFound: jobNotFound,
      assert: async (tx, before) => {
        if (before.status !== 'active') throw wrongStatus('Only an Active Job can be completed.');
        const locked = await tx
          .select()
          .from(contractingMachineAssignments)
          .where(eq(contractingMachineAssignments.jobId, before.id))
          .for('update');
        const detail = await getJob({ db: tx, id: before.id });
        const gate = canComplete(detail.assignments);
        if (!gate.ok && gate.onSite)
          throw new JobError(
            'contracting_job.has_on_site_stints',
            `${gate.onSite} machine(s) are still on site. Capture their departure readings first.`,
          );
        if (!gate.ok && gate.openGapFlags)
          throw new JobError('contracting_job.open_gap_flags', 'Resolve every Gap Flag before completing.');
        const planned = locked.filter((stint) => stint.arrivalReadingId === null).map((stint) => stint.id);
        const requested = new Set(input.removePlannedAssignmentIds);
        if (requested.size !== input.removePlannedAssignmentIds.length || planned.some((id) => !requested.has(id)))
          throw new JobError(
            'contracting_job.stint_not_planned',
            'The planned stints changed. Reload and complete again.',
          );
        if (input.removePlannedAssignmentIds.some((id) => !planned.includes(id)))
          throw new JobError(
            'contracting_job.stint_not_planned',
            'The planned stints changed. Reload and complete again.',
          );
        for (const id of planned) await removeAssignmentWithin({ tx, actorUserId, id });
      },
      set: () => ({
        status: 'completed' as const,
        completedAt: new Date(),
        completedByUserId: actorUserId,
        startDate: input.startDate,
        endDate: input.endDate,
        dieselLitres: input.dieselLitres,
        notes: input.notes,
        updatedAt: new Date(),
      }),
      project: (tx, row) => getJob({ db: tx, id: row.id }),
    }),
  );
}
