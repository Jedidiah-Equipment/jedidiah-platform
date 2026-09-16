import type { Db } from '@pkg/db';
import { contractingChargeLines, contractingJobs } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import type { ChargeLineCreateInput, ChargeLinePatchInput } from '@pkg/schema/contracting';
import { eq, sql } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { JobError, jobNotFound, withJobConstraints, wrongStatus } from './job-errors.js';
import { getJob } from './job-read.js';

type Row = typeof contractingChargeLines.$inferSelect;
export const chargeLineDescriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_charge_line',
  noun: 'Charge Line',
  primaryLabelField: 'description',
  entityId: (row) => row.id,
  toRecord: ({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => row,
});

function assertMutable(status: string) {
  if (status === 'invoiced' || status === 'cancelled') throw wrongStatus('This Job can no longer be changed.');
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
      const [job] = await tx.select().from(contractingJobs).where(eq(contractingJobs.id, input.jobId)).for('update');
      if (!job) throw jobNotFound();
      assertMutable(job.status);
      const [row] = await tx
        .insert(contractingChargeLines)
        .values({
          ...input,
          displayOrder: sql`coalesce((select max(display_order) + 1 from contracting.charge_line where job_id = ${input.jobId}), 0)`,
        })
        .returning();
      if (!row) throw new Error('Charge Line insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor: chargeLineDescriptor, input: row });
      return (await getJob({ db: tx, id: input.jobId })).chargeLines.find((line) => line.id === row.id);
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
    mutateEntity({
      db,
      actorUserId,
      descriptor: chargeLineDescriptor,
      table: contractingChargeLines,
      id: input.id,
      notFound: () => jobNotFound('Charge Line'),
      assert: async (tx, before) => {
        const [job] = await tx.select().from(contractingJobs).where(eq(contractingJobs.id, before.jobId)).for('update');
        if (!job) throw jobNotFound();
        assertMutable(job.status);
      },
      set: (before) => ({
        description: input.description ?? before.description,
        amount: input.amount === undefined ? before.amount : input.amount,
        updatedAt: new Date(),
      }),
      project: async (tx, row) =>
        (await getJob({ db: tx, id: row.jobId })).chargeLines.find((line) => line.id === row.id),
    }),
  );
}

export async function removeChargeLine({ db, actorUserId, id }: { db: Db; actorUserId: AuthId; id: string }) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(contractingChargeLines)
        .where(eq(contractingChargeLines.id, id))
        .for('update');
      if (!row) throw jobNotFound('Charge Line');
      const [job] = await tx.select().from(contractingJobs).where(eq(contractingJobs.id, row.jobId)).for('update');
      if (!job) throw jobNotFound();
      assertMutable(job.status);
      await tx.delete(contractingChargeLines).where(eq(contractingChargeLines.id, id));
      await recordAuditDelete({ db: tx, actorUserId, descriptor: chargeLineDescriptor, input: row });
    }),
  );
}
