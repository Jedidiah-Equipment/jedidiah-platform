import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingChargeLines } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import {
  type ChargeLineCreateInput,
  type ChargeLinePatchInput,
  hasJobStatus,
  unpricedJobStatuses,
} from '@pkg/schema/contracting';
import { eq, sql } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { JobError, jobNotFound, withJobConstraints, wrongStatus } from './job-errors.js';
import { lockJob } from './job-lock.js';
import { chargeLineIn, getJob } from './job-read.js';

type Row = typeof contractingChargeLines.$inferSelect;
export const chargeLineDescriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_charge_line',
  noun: 'Charge Line',
  primaryLabelField: 'description',
  entityId: (row) => row.id,
  toRecord: ({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => row,
});

/** Locks a Job whose Charge Lines are about to change, and checks they still may. */
async function lockChargeableJob(tx: DatabaseTransaction, jobId: string) {
  const job = await lockJob(tx, jobId);
  if (!hasJobStatus(unpricedJobStatuses, job.status))
    throw wrongStatus('Charge Lines cannot be changed after the Job is priced.');
  return job;
}

/** The Job a Charge Line belongs to, locked before the line itself: the job → child order every writer keeps. */
async function lockLineJob(tx: DatabaseTransaction, id: string) {
  const [reference] = await tx
    .select({ jobId: contractingChargeLines.jobId })
    .from(contractingChargeLines)
    .where(eq(contractingChargeLines.id, id));
  if (!reference) throw jobNotFound('Charge Line');
  return lockChargeableJob(tx, reference.jobId);
}

export async function createChargeLine({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: ChargeLineCreateInput;
}) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      await lockChargeableJob(tx, input.jobId);
      const [row] = await tx
        .insert(contractingChargeLines)
        .values({
          ...input,
          displayOrder: sql`coalesce((select max(display_order) + 1 from contracting.charge_line where job_id = ${input.jobId}), 0)`,
        })
        .returning();
      if (!row) throw new Error('Charge Line insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor: chargeLineDescriptor, input: row });
      return chargeLineIn(await getJob({ db: tx, id: input.jobId }), row.id);
    }),
  );
}

export async function patchChargeLine({
  db,
  actorUserId,
  input,
  canPrice,
}: {
  db: Db;
  actorUserId: AuthId;
  input: ChargeLinePatchInput;
  canPrice: boolean;
}) {
  if (input.amount !== undefined && !canPrice)
    throw new JobError('contracting_job.invalid_role', 'Only Pricing may set a Charge Line amount.');
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const job = await lockLineJob(tx, input.id);
      return mutateEntity({
        db: tx,
        actorUserId,
        descriptor: chargeLineDescriptor,
        table: contractingChargeLines,
        id: input.id,
        notFound: () => jobNotFound('Charge Line'),
        set: (before) => ({
          description: input.description ?? before.description,
          amount: input.amount === undefined ? before.amount : input.amount,
          updatedAt: new Date(),
        }),
        project: async (innerTx, row) => chargeLineIn(await getJob({ db: innerTx, id: job.id }), row.id),
      });
    }),
  );
}

export async function removeChargeLine({ db, actorUserId, id }: { db: Db; actorUserId: AuthId; id: string }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      await lockLineJob(tx, id);
      const [row] = await tx
        .select()
        .from(contractingChargeLines)
        .where(eq(contractingChargeLines.id, id))
        .for('update');
      if (!row) throw jobNotFound('Charge Line');
      await tx.delete(contractingChargeLines).where(eq(contractingChargeLines.id, id));
      await recordAuditDelete({ db: tx, actorUserId, descriptor: chargeLineDescriptor, input: row });
    }),
  );
}
