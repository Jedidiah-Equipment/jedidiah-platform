import type { Db } from '@pkg/db';
import { contractingCategories } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import { Category, type CategoryCreateInput, type CategoryPatchInput } from '@pkg/schema/contracting';
import { asc, eq } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { FleetError, withFleetConstraints } from './fleet-errors.js';
import { removeFleetEntry } from './remove-fleet-entry.js';

type Row = typeof contractingCategories.$inferSelect;
const descriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_category',
  noun: 'category',
  primaryLabelField: 'name',
  entityId: (row) => row.id,
  toRecord: (row) => ({ name: row.name, presetRate: row.presetRate }),
});
const mapCategory = (row: Row) =>
  Category.parse({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
export async function listCategories({ db }: { db: Db }) {
  return (await db.select().from(contractingCategories).orderBy(asc(contractingCategories.name))).map(mapCategory);
}
export async function getCategory({ db, id }: { db: Db; id: string }) {
  const [row] = await db.select().from(contractingCategories).where(eq(contractingCategories.id, id));
  if (!row) throw new FleetError('fleet.not_found', 'Category not found.');
  return mapCategory(row);
}
export async function createCategory({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: CategoryCreateInput;
}) {
  return withFleetConstraints(() =>
    db.transaction(async (tx) => {
      const [row] = await tx.insert(contractingCategories).values(input).returning();
      if (!row) throw new Error('Category insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor, input: row });
      return mapCategory(row);
    }),
  );
}
export async function patchCategory({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: CategoryPatchInput;
}) {
  return withFleetConstraints(() =>
    mutateEntity({
      db,
      actorUserId,
      descriptor,
      table: contractingCategories,
      id: input.id,
      notFound: () => new FleetError('fleet.not_found', 'Category not found.'),
      set: (before) => ({
        name: input.name ?? before.name,
        presetRate: input.presetRate ?? before.presetRate,
        updatedAt: new Date(),
      }),
      project: (_tx, row) => mapCategory(row),
    }),
  );
}
export async function removeCategory(args: { db: Db; actorUserId: AuthId; id: string }) {
  return removeFleetEntry({ ...args, table: contractingCategories, descriptor });
}
