import type { DatabaseTransaction, Db } from '@pkg/db';
import { getForeignKeyViolationConstraint } from '@pkg/db';
import { contractingMeasureTypes } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import {
  MeasureType,
  type MeasureTypeCreateInput,
  type MeasureTypePatchInput,
  type ReorderInput,
} from '@pkg/schema/contracting';
import { asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { RateCardError, rateCardNotFound, withRateCardConstraints } from './rate-card-errors.js';

type Row = typeof contractingMeasureTypes.$inferSelect;
const descriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_measure_type',
  noun: 'measure type',
  primaryLabelField: 'name',
  entityId: (row) => row.id,
  toRecord: (row) => ({ name: row.name }),
});
const inUse = sql<boolean>`exists (select 1 from contracting.rate r where r.measure_type_id = contracting.measure_type.id)`;
const selectMeasureTypes = (db: Db | DatabaseTransaction) =>
  db.select({ ...getTableColumns(contractingMeasureTypes), inUse }).from(contractingMeasureTypes);
const mapMeasureType = (row: Row & { inUse: boolean }) =>
  MeasureType.parse({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
const byDisplayOrder = [asc(contractingMeasureTypes.displayOrder), asc(contractingMeasureTypes.id)];

export async function listMeasureTypes({ db }: { db: Db }) {
  return (await selectMeasureTypes(db).orderBy(...byDisplayOrder)).map(mapMeasureType);
}

export async function getMeasureType({ db, id }: { db: Db | DatabaseTransaction; id: string }) {
  const [row] = await selectMeasureTypes(db).where(eq(contractingMeasureTypes.id, id));
  if (!row) throw rateCardNotFound('Measure type');
  return mapMeasureType(row);
}

export async function createMeasureType({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: MeasureTypeCreateInput;
}) {
  return withRateCardConstraints('A measure type with that name already exists.', () =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .insert(contractingMeasureTypes)
        .values({
          ...input,
          displayOrder: sql`coalesce((select max(display_order) + 1 from contracting.measure_type), 0)`,
        })
        .returning();
      if (!row) throw new Error('Measure type insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor, input: row });
      return getMeasureType({ db: tx, id: row.id });
    }),
  );
}

export async function patchMeasureType({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: MeasureTypePatchInput;
}) {
  return withRateCardConstraints('A measure type with that name already exists.', () =>
    mutateEntity({
      db,
      actorUserId,
      descriptor,
      table: contractingMeasureTypes,
      id: input.id,
      notFound: () => rateCardNotFound('Measure type'),
      set: (before) => ({ name: input.name ?? before.name, updatedAt: new Date() }),
      project: (tx, row) => getMeasureType({ db: tx, id: row.id }),
    }),
  );
}

export async function reorderMeasureTypes({ db, input }: { db: Db; input: ReorderInput }) {
  await db.transaction(async (tx) => {
    const ids = new Set(
      (await tx.select({ id: contractingMeasureTypes.id }).from(contractingMeasureTypes)).map((row) => row.id),
    );
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
          .update(contractingMeasureTypes)
          .set({ displayOrder: index, updatedAt: new Date() })
          .where(eq(contractingMeasureTypes.id, id)),
      ),
    );
  });
  return listMeasureTypes({ db });
}

export async function removeMeasureType({ db, actorUserId, id }: { db: Db; actorUserId: AuthId; id: string }) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(contractingMeasureTypes)
      .where(eq(contractingMeasureTypes.id, id))
      .for('update');
    if (!row) throw rateCardNotFound('Measure type');
    try {
      await tx.delete(contractingMeasureTypes).where(eq(contractingMeasureTypes.id, id));
    } catch (error) {
      if (getForeignKeyViolationConstraint(error))
        throw new RateCardError(
          'rate_card.in_use',
          'This measure type is used by a rate. Remove it from those rates first.',
        );
      throw error;
    }
    await recordAuditDelete({ db: tx, descriptor, actorUserId, input: row });
  });
}
