import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingMeasureTypes } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import {
  MeasureType,
  type MeasureTypeCreateInput,
  type MeasureTypePatchInput,
  type ReorderInput,
} from '@pkg/schema/contracting';
import { asc, eq } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { nextDisplayOrder, reorderDisplayOrder } from '../display-order.js';
import { removeAudited } from '../remove-audited.js';
import { RateCardError, rateCardNotFound, reorderMismatch, withRateCardConstraints } from './rate-card-errors.js';

type Row = typeof contractingMeasureTypes.$inferSelect;
const descriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_measure_type',
  noun: 'measure type',
  primaryLabelField: 'name',
  entityId: (row) => row.id,
  toRecord: (row) => ({ name: row.name }),
});
const selectMeasureTypes = (db: Db | DatabaseTransaction) => db.select().from(contractingMeasureTypes);
const mapMeasureType = (row: Row) =>
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
        .values({ ...input, displayOrder: nextDisplayOrder(contractingMeasureTypes) })
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
  await db.transaction((tx) => reorderDisplayOrder(tx, contractingMeasureTypes, input.orderedIds, reorderMismatch));
  return listMeasureTypes({ db });
}

export async function removeMeasureType({ db, actorUserId, id }: { db: Db; actorUserId: AuthId; id: string }) {
  return removeAudited({
    db,
    actorUserId,
    id,
    table: contractingMeasureTypes,
    descriptor,
    notFound: () => rateCardNotFound('Measure type'),
    inUse: (constraint) =>
      new RateCardError(
        'rate_card.in_use',
        constraint === 'rate_measure_type_id_measure_type_id_fk'
          ? 'This measure type is used by a rate. Remove it from those rates first.'
          : 'This measure type is recorded on jobs, so it cannot be deleted.',
      ),
  });
}
