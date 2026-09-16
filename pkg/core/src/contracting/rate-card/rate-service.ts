import type { DatabaseTransaction, Db } from '@pkg/db';
import { getForeignKeyViolationConstraint } from '@pkg/db';
import { contractingMeasureTypes, contractingRates } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import {
  Rate,
  type RateCreateInput,
  type RateListInput,
  type RatePatchInput,
  type ReorderInput,
} from '@pkg/schema/contracting';
import { asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { RateCardError, rateCardNotFound, withRateCardConstraints } from './rate-card-errors.js';

type Row = typeof contractingRates.$inferSelect;
const descriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_rate',
  noun: 'rate',
  primaryLabelField: 'name',
  entityId: (row) => row.id,
  toRecord: (row) => ({
    name: row.name,
    basis: row.basis,
    measureTypeId: row.measureTypeId,
    amount: row.amount,
    active: row.active,
  }),
});
const inUse = sql<boolean>`exists (
  select 1 from contracting.machine_assignment assignment
  where assignment.rate_id = contracting.rate.id
)`;
const selectRates = (db: Db | DatabaseTransaction) =>
  db
    .select({ ...getTableColumns(contractingRates), measureTypeName: contractingMeasureTypes.name, inUse })
    .from(contractingRates)
    .leftJoin(contractingMeasureTypes, eq(contractingMeasureTypes.id, contractingRates.measureTypeId));
const mapRate = (row: Row & { measureTypeName: string | null; inUse: boolean }) =>
  Rate.parse({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
const byDisplayOrder = [asc(contractingRates.displayOrder), asc(contractingRates.id)];

export async function listRates({ db, input = { status: 'all' } }: { db: Db; input?: RateListInput }) {
  const where = input.status === 'all' ? undefined : eq(contractingRates.active, input.status === 'active');
  return (
    await selectRates(db)
      .where(where)
      .orderBy(...byDisplayOrder)
  ).map(mapRate);
}

/** Pricing's picker: active Rates in Rate Card display order. */
export const rateOptions = ({ db }: { db: Db }) => listRates({ db, input: { status: 'active' } });

export async function getRate({ db, id }: { db: Db | DatabaseTransaction; id: string }) {
  const [row] = await selectRates(db).where(eq(contractingRates.id, id));
  if (!row) throw rateCardNotFound('Rate');
  return mapRate(row);
}

export async function createRate({ db, actorUserId, input }: { db: Db; actorUserId: AuthId; input: RateCreateInput }) {
  return withRateCardConstraints('A rate with that name already exists.', () =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .insert(contractingRates)
        .values({ ...input, displayOrder: sql`coalesce((select max(display_order) + 1 from contracting.rate), 0)` })
        .returning();
      if (!row) throw new Error('Rate insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor, input: row });
      return getRate({ db: tx, id: row.id });
    }),
  );
}

export async function patchRate({ db, actorUserId, input }: { db: Db; actorUserId: AuthId; input: RatePatchInput }) {
  return withRateCardConstraints('A rate with that name already exists.', () =>
    mutateEntity({
      db,
      actorUserId,
      descriptor,
      table: contractingRates,
      id: input.id,
      notFound: () => rateCardNotFound('Rate'),
      set: (before) => ({
        name: input.name ?? before.name,
        basis: input.basis ?? before.basis,
        measureTypeId: input.measureTypeId === undefined ? before.measureTypeId : input.measureTypeId,
        amount: input.amount ?? before.amount,
        active: input.active ?? before.active,
        updatedAt: new Date(),
      }),
      project: (tx, row) => getRate({ db: tx, id: row.id }),
    }),
  );
}

export async function reorderRates({ db, input }: { db: Db; input: ReorderInput }) {
  await db.transaction(async (tx) => {
    const ids = new Set((await tx.select({ id: contractingRates.id }).from(contractingRates)).map((row) => row.id));
    const distinct = new Set(input.orderedIds);
    if (
      distinct.size !== input.orderedIds.length ||
      distinct.size !== ids.size ||
      [...distinct].some((id) => !ids.has(id))
    )
      throw new RateCardError('rate_card.reorder_mismatch', 'The list changed. Reload and try again.');
    await Promise.all(
      input.orderedIds.map((id, index) =>
        tx
          .update(contractingRates)
          .set({ displayOrder: index, updatedAt: new Date() })
          .where(eq(contractingRates.id, id)),
      ),
    );
  });
  return listRates({ db });
}

export async function removeRate({ db, actorUserId, id }: { db: Db; actorUserId: AuthId; id: string }) {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(contractingRates).where(eq(contractingRates.id, id)).for('update');
    if (!row) throw rateCardNotFound('Rate');
    try {
      await tx.delete(contractingRates).where(eq(contractingRates.id, id));
    } catch (error) {
      if (getForeignKeyViolationConstraint(error))
        throw new RateCardError(
          'rate_card.in_use',
          'This rate is on priced jobs. Deactivate it instead of deleting it.',
        );
      throw error;
    }
    await recordAuditDelete({ db: tx, descriptor, actorUserId, input: row });
  });
}
