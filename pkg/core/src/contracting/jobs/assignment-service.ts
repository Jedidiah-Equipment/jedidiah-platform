import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingMachineAssignments, contractingMachines } from '@pkg/db/contracting';
import { formatHours } from '@pkg/domain';
import { round1 } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import type {
  AssignmentAddInput,
  AssignmentPatchInput,
  AssignmentPlanInput,
  GapResolveInput,
} from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { assertOwner, JobError, jobNotFound, withJobConstraints, wrongStatus } from './job-errors.js';
import { lockJob } from './job-lock.js';
import { getJob } from './job-read.js';

type Row = typeof contractingMachineAssignments.$inferSelect;
export const assignmentDescriptor = (machineCode: string) =>
  defineAuditDescriptor<Row>({
    entityType: 'contracting_assignment',
    noun: 'Machine Assignment',
    primaryLabelField: 'machineCode',
    label: () => machineCode,
    entityId: (row) => row.id,
    toRecord: ({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => ({
      ...row,
      gapResolvedAt: row.gapResolvedAt?.toISOString() ?? null,
    }),
  });

async function createAssignment({
  db,
  actorUserId,
  input,
  ownerOnly,
}: {
  db: Db;
  actorUserId: AuthId;
  input: AssignmentPlanInput | AssignmentAddInput;
  ownerOnly: boolean;
}) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const job = await lockJob(tx, input.jobId);
      if (!['upcoming', 'active'].includes(job.status))
        throw wrongStatus('Machine Assignments can only be added to an Upcoming or Active Job.');
      if (ownerOnly) assertOwner(job, actorUserId);
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
      return (await getJob({ db: tx, id: job.id })).assignments.find((assignment) => assignment.id === row.id);
    }),
  );
}

export const planAssignment = (args: { db: Db; actorUserId: AuthId; input: AssignmentPlanInput }) =>
  createAssignment({ ...args, ownerOnly: false });

export const addAssignment = (args: { db: Db; actorUserId: AuthId; input: AssignmentAddInput }) =>
  createAssignment({ ...args, ownerOnly: true });

export async function patchAssignment({
  db,
  actorUserId,
  input,
  ownerOnly = false,
}: {
  db: Db;
  actorUserId: AuthId;
  input: AssignmentPatchInput;
  ownerOnly?: boolean;
}) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const [reference] = await tx
        .select({ jobId: contractingMachineAssignments.jobId, machineCode: contractingMachines.code })
        .from(contractingMachineAssignments)
        .innerJoin(contractingMachines, eq(contractingMachines.id, contractingMachineAssignments.machineId))
        .where(eq(contractingMachineAssignments.id, input.id));
      if (!reference) throw jobNotFound('Machine Assignment');
      const job = await lockJob(tx, reference.jobId);
      return mutateEntity({
        db: tx,
        actorUserId,
        descriptor: assignmentDescriptor(reference.machineCode),
        table: contractingMachineAssignments,
        id: input.id,
        notFound: () => jobNotFound('Machine Assignment'),
        assert: (_innerTx, before) => {
          if (ownerOnly) {
            assertOwner(job, actorUserId);
            if (job.status !== 'active') throw wrongStatus('Foremen can change stints only while the Job is Active.');
          }
          if (['cancelled', 'invoiced'].includes(job.status))
            throw wrongStatus('A Cancelled or Invoiced Job cannot be changed.');
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
          updatedAt: new Date(),
        }),
        project: async (innerTx, row) => {
          const detail = await getJob({ db: innerTx, id: row.jobId });
          return detail.assignments.find((assignment) => assignment.id === row.id);
        },
      });
    }),
  );
}

export async function removeAssignmentWithin({
  tx,
  actorUserId,
  id,
}: {
  tx: DatabaseTransaction;
  actorUserId: AuthId;
  id: string;
}) {
  const [row] = await tx
    .select()
    .from(contractingMachineAssignments)
    .where(eq(contractingMachineAssignments.id, id))
    .for('update');
  if (!row) throw jobNotFound('Machine Assignment');
  if (row.arrivalReadingId)
    throw new JobError('contracting_job.stint_not_planned', 'Only a planned Machine Assignment can be removed.');
  const [machine] = await tx
    .select({ code: contractingMachines.code })
    .from(contractingMachines)
    .where(eq(contractingMachines.id, row.machineId));
  if (!machine) throw new JobError('contracting_job.invalid_reference', 'Machine not found.');
  await tx.delete(contractingMachineAssignments).where(eq(contractingMachineAssignments.id, id));
  await recordAuditDelete({
    db: tx,
    actorUserId,
    descriptor: assignmentDescriptor(machine.code),
    input: row,
  });
  return row;
}

export async function removeAssignment({ db, actorUserId, id }: { db: Db; actorUserId: AuthId; id: string }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const [reference] = await tx
        .select({ jobId: contractingMachineAssignments.jobId })
        .from(contractingMachineAssignments)
        .where(eq(contractingMachineAssignments.id, id));
      if (!reference) throw jobNotFound('Machine Assignment');
      const job = await lockJob(tx, reference.jobId);
      if (!['upcoming', 'active'].includes(job.status))
        throw wrongStatus('Machine Assignments can only be removed from an Upcoming or Active Job.');
      return removeAssignmentWithin({ tx, actorUserId, id });
    }),
  );
}

export async function resolveGap({ db, actorUserId, input }: { db: Db; actorUserId: AuthId; input: GapResolveInput }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const [reference] = await tx
        .select({ jobId: contractingMachineAssignments.jobId, machineCode: contractingMachines.code })
        .from(contractingMachineAssignments)
        .innerJoin(contractingMachines, eq(contractingMachines.id, contractingMachineAssignments.machineId))
        .where(eq(contractingMachineAssignments.id, input.id));
      if (!reference) throw jobNotFound('Machine Assignment');
      const job = await lockJob(tx, reference.jobId);
      if (!['active', 'completed'].includes(job.status))
        throw wrongStatus('Hour Gaps can only be resolved on an Active or Completed Job.');
      return mutateEntity({
        db: tx,
        actorUserId,
        descriptor: assignmentDescriptor(reference.machineCode),
        table: contractingMachineAssignments,
        id: input.id,
        notFound: () => jobNotFound('Machine Assignment'),
        assert: async (innerTx, before) => {
          if (!before.arrivalReadingId || !before.departureReadingId)
            throw new JobError('contracting_job.stint_not_on_site', 'The Machine Assignment must have left the Job.');
          const detail = await getJob({ db: innerTx, id: before.jobId });
          const stint = detail.assignments.find((assignment) => assignment.id === before.id);
          if (!stint || stint.gapHours === null)
            throw new JobError('contracting_job.invalid_reference', 'This Machine Assignment has no Hour Gap.');
          if (round1(input.travelHours + input.unaccountedHours) !== stint.gapHours)
            throw new JobError(
              'contracting_job.invalid_reference',
              `Travel Hours and the Unaccounted Interval must total ${formatHours(stint.gapHours)}.`,
            );
        },
        set: () => ({
          gapTravelHours: input.travelHours,
          gapUnaccountedHours: input.unaccountedHours,
          gapReason: input.reason,
          gapResolvedAt: new Date(),
          gapResolvedByUserId: actorUserId,
          updatedAt: new Date(),
        }),
        project: async (innerTx, row) => {
          const detail = await getJob({ db: innerTx, id: row.jobId });
          return detail.assignments.find((assignment) => assignment.id === row.id);
        },
      });
    }),
  );
}
