import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingMeasures, contractingMeasureTypes } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import {
  hasJobStatus,
  type MeasureRemoveInput,
  type MeasureSetInput,
  workedJobStatuses,
} from '@pkg/schema/contracting';
import { and, eq } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { jobNotFound, withJobConstraints, wrongStatus } from './job-errors.js';
import { lockAssignment } from './job-lock.js';
import { assignmentIn, getJob } from './job-read.js';

type Row = typeof contractingMeasures.$inferSelect;
export const measureDescriptor = (measureTypeName: string) =>
  defineAuditDescriptor<Row>({
    entityType: 'contracting_measure',
    noun: 'Measure',
    primaryLabelField: 'measureTypeName',
    label: () => measureTypeName,
    entityId: (row) => row.id,
    toRecord: ({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => row,
  });

async function getMeasureTypeName(tx: DatabaseTransaction, id: string) {
  const [measureType] = await tx
    .select({ name: contractingMeasureTypes.name })
    .from(contractingMeasureTypes)
    .where(eq(contractingMeasureTypes.id, id));
  if (!measureType) throw jobNotFound('Measure Type');
  return measureType.name;
}

/** Locks the stint and its Job, and checks its Measures may change. */
async function lockMeasurable(tx: DatabaseTransaction, assignmentId: string) {
  const { job, stint } = await lockAssignment(tx, assignmentId);
  if (!stint.arrivalReadingId) throw wrongStatus('Measures can only be recorded after the Machine has arrived.');
  if (!hasJobStatus(workedJobStatuses, job.status))
    throw wrongStatus('Measures can only be changed on an Active or Completed Job.');
  return job;
}

async function lockMeasure(tx: DatabaseTransaction, { assignmentId, measureTypeId }: MeasureRemoveInput) {
  const [row] = await tx
    .select()
    .from(contractingMeasures)
    .where(
      and(eq(contractingMeasures.assignmentId, assignmentId), eq(contractingMeasures.measureTypeId, measureTypeId)),
    )
    .for('update');
  return row;
}

/** Records a stint's quantity of one Measure Type, replacing any quantity already recorded. */
export async function setMeasure({ db, actorUserId, input }: { db: Db; actorUserId: AuthId; input: MeasureSetInput }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const job = await lockMeasurable(tx, input.assignmentId);
      const descriptor = measureDescriptor(await getMeasureTypeName(tx, input.measureTypeId));
      const before = await lockMeasure(tx, input);
      if (before) {
        await mutateEntity({
          db: tx,
          actorUserId,
          descriptor,
          table: contractingMeasures,
          id: before.id,
          notFound: () => jobNotFound('Measure'),
          set: () => ({ quantity: input.quantity, updatedAt: new Date() }),
          project: () => undefined,
        });
      } else {
        const [row] = await tx.insert(contractingMeasures).values(input).returning();
        if (!row) throw new Error('Measure insert returned no row');
        await recordAuditCreate({ db: tx, actorUserId, descriptor, input: row });
      }
      const measure = assignmentIn(await getJob({ db: tx, id: job.id }), input.assignmentId).measures.find(
        (candidate) => candidate.measureTypeId === input.measureTypeId,
      );
      if (!measure) throw jobNotFound('Measure');
      return measure;
    }),
  );
}

export async function removeMeasure({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: MeasureRemoveInput;
}) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      await lockMeasurable(tx, input.assignmentId);
      const row = await lockMeasure(tx, input);
      if (!row) throw jobNotFound('Measure');
      const descriptor = measureDescriptor(await getMeasureTypeName(tx, row.measureTypeId));
      await tx.delete(contractingMeasures).where(eq(contractingMeasures.id, row.id));
      await recordAuditDelete({ db: tx, actorUserId, descriptor, input: row });
    }),
  );
}
