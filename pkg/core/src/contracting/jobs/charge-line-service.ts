import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingChargeLines } from '@pkg/db/contracting';
import type { JobActor } from '@pkg/domain/contracting';
import type { ChargeLineCreateInput, ChargeLinePatchInput, JobActionName } from '@pkg/schema/contracting';
import { eq, sql } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { nextDisplayOrder } from '../display-order.js';
import { assertJobAction, jobNotFound } from './job-errors.js';
import { lockJobFor } from './job-lock.js';
import { jobTransaction } from './job-write.js';

type Row = typeof contractingChargeLines.$inferSelect;
export const chargeLineDescriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_charge_line',
  noun: 'Charge Line',
  primaryLabelField: 'description',
  entityId: (row) => row.id,
  toRecord: ({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => row,
});

/** The Job a Charge Line belongs to, locked before the line itself: the job → child order every writer keeps. */
async function lockLineJob(
  tx: DatabaseTransaction,
  id: string,
  actor: JobActor,
  action: JobActionName = 'editChargeLines',
) {
  const [reference] = await tx
    .select({ jobId: contractingChargeLines.jobId })
    .from(contractingChargeLines)
    .where(eq(contractingChargeLines.id, id));
  if (!reference) throw jobNotFound('Charge Line');
  return lockJobFor(tx, reference.jobId, action, actor);
}

export async function createChargeLine({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: ChargeLineCreateInput;
}): Promise<void> {
  await jobTransaction(db, async (tx) => {
    await lockJobFor(tx, input.jobId, 'editChargeLines', actor);
    const [row] = await tx
      .insert(contractingChargeLines)
      .values({
        ...input,
        displayOrder: nextDisplayOrder(contractingChargeLines, sql`job_id = ${input.jobId}`),
      })
      .returning();
    if (!row) throw new Error('Charge Line insert returned no row');
    await recordAuditCreate({ db: tx, actorUserId: actor.userId, descriptor: chargeLineDescriptor, input: row });
  });
}

export async function patchChargeLine({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: ChargeLinePatchInput;
}): Promise<void> {
  await jobTransaction(db, async (tx) => {
    const prices = input.amount !== undefined;
    const job = await lockLineJob(tx, input.id, actor, prices ? 'priceChargeLines' : 'editChargeLines');
    if (prices) assertJobAction('editChargeLines', job, actor);
    await mutateEntity({
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
      project: () => undefined,
    });
  });
}

export async function removeChargeLine({ db, actor, id }: { db: Db; actor: JobActor; id: string }): Promise<void> {
  await jobTransaction(db, async (tx) => {
    await lockLineJob(tx, id, actor);
    const [row] = await tx.select().from(contractingChargeLines).where(eq(contractingChargeLines.id, id)).for('update');
    if (!row) throw jobNotFound('Charge Line');
    await tx.delete(contractingChargeLines).where(eq(contractingChargeLines.id, id));
    await recordAuditDelete({ db: tx, actorUserId: actor.userId, descriptor: chargeLineDescriptor, input: row });
  });
}
