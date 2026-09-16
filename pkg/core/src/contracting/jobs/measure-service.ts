import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingJobs, contractingMachineAssignments, contractingMeasures } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import type { MeasureRemoveInput, MeasureSetInput } from '@pkg/schema/contracting';
import { and, eq } from 'drizzle-orm';
import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditDelete,
  recordAuditUpdate,
} from '../../audit/audit-writer.js';
import { jobNotFound, withJobConstraints, wrongStatus } from './job-errors.js';
import { getJob } from './job-read.js';

type Row = typeof contractingMeasures.$inferSelect;
export const measureDescriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_measure',
  noun: 'Measure',
  primaryLabelField: 'measureTypeId',
  entityId: (row) => row.id,
  toRecord: ({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => row,
});

async function lockMeasureJob(db: DatabaseTransaction, assignmentId: string) {
  const [reference] = await db
    .select({ jobId: contractingMachineAssignments.jobId })
    .from(contractingMachineAssignments)
    .where(eq(contractingMachineAssignments.id, assignmentId));
  if (!reference) throw jobNotFound('Machine Assignment');
  const [job] = await db.select().from(contractingJobs).where(eq(contractingJobs.id, reference.jobId)).for('update');
  if (!job) throw jobNotFound();
  const [stint] = await db
    .select()
    .from(contractingMachineAssignments)
    .where(eq(contractingMachineAssignments.id, assignmentId))
    .for('update');
  if (!stint) throw jobNotFound('Machine Assignment');
  if (!stint.arrivalReadingId) throw wrongStatus('Measures can only be recorded after the Machine has arrived.');
  if (!['active', 'completed'].includes(job.status))
    throw wrongStatus('Measures can only be changed on an Active or Completed Job.');
  return { job, stint };
}

export async function setMeasure({ db, actorUserId, input }: { db: Db; actorUserId: AuthId; input: MeasureSetInput }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const { job } = await lockMeasureJob(tx, input.assignmentId);
      const [before] = await tx
        .select()
        .from(contractingMeasures)
        .where(
          and(
            eq(contractingMeasures.assignmentId, input.assignmentId),
            eq(contractingMeasures.measureTypeId, input.measureTypeId),
          ),
        )
        .for('update');
      const now = new Date();
      const [row] = await tx
        .insert(contractingMeasures)
        .values({ ...input, updatedAt: now })
        .onConflictDoUpdate({
          target: [contractingMeasures.assignmentId, contractingMeasures.measureTypeId],
          set: { quantity: input.quantity, updatedAt: now },
        })
        .returning();
      if (!row) throw new Error('Measure upsert returned no row');
      if (!before) {
        await recordAuditCreate({ db: tx, actorUserId, descriptor: measureDescriptor, input: row });
      } else {
        const changes = diffAuditUpdate(measureDescriptor, before, row);
        if (changes)
          await recordAuditUpdate({ db: tx, actorUserId, descriptor: measureDescriptor, after: row, changes });
      }
      return (await getJob({ db: tx, id: job.id })).assignments
        .find((assignment) => assignment.id === input.assignmentId)
        ?.measures.find((measure) => measure.measureTypeId === input.measureTypeId);
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
      await lockMeasureJob(tx, input.assignmentId);
      const [row] = await tx
        .select()
        .from(contractingMeasures)
        .where(
          and(
            eq(contractingMeasures.assignmentId, input.assignmentId),
            eq(contractingMeasures.measureTypeId, input.measureTypeId),
          ),
        )
        .for('update');
      if (!row) throw jobNotFound('Measure');
      await tx.delete(contractingMeasures).where(eq(contractingMeasures.id, row.id));
      await recordAuditDelete({ db: tx, actorUserId, descriptor: measureDescriptor, input: row });
    }),
  );
}
