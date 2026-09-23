import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingChargeLines } from '@pkg/db/contracting';
import { hasPermission } from '@pkg/domain';
import type { JobActor } from '@pkg/domain/contracting';
import type { ChargeLineCreateInput, ChargeLinePatchInput } from '@pkg/schema/contracting';
import { eq, sql } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { assertJobAction, JobError, jobNotFound, withJobConstraints } from './job-errors.js';
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
async function lockChargeableJob(tx: DatabaseTransaction, jobId: string, actor: JobActor) {
  const job = await lockJob(tx, jobId);
  assertJobAction('editChargeLines', job, actor);
  return job;
}

/** The Job a Charge Line belongs to, locked before the line itself: the job → child order every writer keeps. */
async function lockLineJob(tx: DatabaseTransaction, id: string, actor: JobActor) {
  const [reference] = await tx
    .select({ jobId: contractingChargeLines.jobId })
    .from(contractingChargeLines)
    .where(eq(contractingChargeLines.id, id));
  if (!reference) throw jobNotFound('Charge Line');
  return lockChargeableJob(tx, reference.jobId, actor);
}

export async function createChargeLine({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: ChargeLineCreateInput;
}) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      await lockChargeableJob(tx, input.jobId, actor);
      const [row] = await tx
        .insert(contractingChargeLines)
        .values({
          ...input,
          displayOrder: sql`coalesce((select max(display_order) + 1 from contracting.charge_line where job_id = ${input.jobId}), 0)`,
        })
        .returning();
      if (!row) throw new Error('Charge Line insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId: actor.userId, descriptor: chargeLineDescriptor, input: row });
      return chargeLineIn(await getJob({ db: tx, id: input.jobId }), row.id);
    }),
  );
}

export async function patchChargeLine({ db, actor, input }: { db: Db; actor: JobActor; input: ChargeLinePatchInput }) {
  // Judges the input, not the Job: only whoever prices may set an amount on a line.
  if (input.amount !== undefined && !hasPermission(actor, 'contracting_job:price'))
    throw new JobError('contracting_job.invalid_role', 'Only Pricing may set a Charge Line amount.');
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const job = await lockLineJob(tx, input.id, actor);
      return mutateEntity({
        db: tx,
        actorUserId: actor.userId,
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

export async function removeChargeLine({ db, actor, id }: { db: Db; actor: JobActor; id: string }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      await lockLineJob(tx, id, actor);
      const [row] = await tx
        .select()
        .from(contractingChargeLines)
        .where(eq(contractingChargeLines.id, id))
        .for('update');
      if (!row) throw jobNotFound('Charge Line');
      await tx.delete(contractingChargeLines).where(eq(contractingChargeLines.id, id));
      await recordAuditDelete({ db: tx, actorUserId: actor.userId, descriptor: chargeLineDescriptor, input: row });
    }),
  );
}
