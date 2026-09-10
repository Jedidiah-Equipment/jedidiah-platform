import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingCategories } from '@pkg/db/contracting';
import { DEFAULT_CATEGORY_COLOUR, defaultCategoryIcon } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import {
  Category,
  type CategoryCreateInput,
  type CategoryKind,
  type CategoryListInput,
  type CategoryPatchInput,
} from '@pkg/schema/contracting';
import { asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { FleetError, invalidCategory, kindInUse, withFleetConstraints } from './fleet-errors.js';
import { removeFleetEntry } from './remove-fleet-entry.js';

type Row = typeof contractingCategories.$inferSelect;
const descriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_category',
  noun: 'category',
  primaryLabelField: 'name',
  entityId: (row) => row.id,
  toRecord: (row) => ({ name: row.name, kind: row.kind, icon: row.icon, colour: row.colour }),
});
const mapCategory = (row: Row & { inUse: boolean }) =>
  Category.parse({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
// Drizzle renders columns inside a correlated subquery unqualified, where a bare "id" binds to the
// inner table, so every identifier here is spelled out in full.
const inUse = sql<boolean>`(exists (select 1 from contracting.machine m where m.category_id = contracting.category.id) or exists (select 1 from contracting.implement i where i.category_id = contracting.category.id))`;
const selectCategories = (db: Db | DatabaseTransaction) =>
  db.select({ ...getTableColumns(contractingCategories), inUse }).from(contractingCategories);
export async function listCategories({ db, input = {} }: { db: Db; input?: CategoryListInput }) {
  return (
    await selectCategories(db)
      .where(input.kind ? eq(contractingCategories.kind, input.kind) : undefined)
      .orderBy(asc(contractingCategories.name))
  ).map(mapCategory);
}
export async function getCategory({ db, id }: { db: Db | DatabaseTransaction; id: string }) {
  const [row] = await selectCategories(db).where(eq(contractingCategories.id, id));
  if (!row) throw new FleetError('fleet.not_found', 'Category not found.');
  return mapCategory(row);
}
/**
 * The friendly half of the kind rule: the share lock pairs with migration 0147's trigger, which
 * catches a kind flip racing this read.
 */
export async function assertCategoryKind(tx: DatabaseTransaction, id: string, kind: CategoryKind) {
  const [category] = await tx
    .select({ kind: contractingCategories.kind })
    .from(contractingCategories)
    .where(eq(contractingCategories.id, id))
    .for('share');
  if (!category) throw new FleetError('fleet.invalid_reference', 'The selected record no longer exists.');
  if (category.kind !== kind) throw invalidCategory(kind);
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
      const [row] = await tx
        .insert(contractingCategories)
        .values({
          ...input,
          icon: input.icon ?? defaultCategoryIcon(input.kind),
          colour: input.colour ?? DEFAULT_CATEGORY_COLOUR,
        })
        .returning();
      if (!row) throw new Error('Category insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor, input: row });
      return mapCategory({ ...row, inUse: false });
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
      assert: async (tx, before) => {
        if (
          input.kind !== undefined &&
          input.kind !== before.kind &&
          (await getCategory({ db: tx, id: before.id })).inUse
        )
          throw kindInUse();
      },
      set: (before) => ({
        name: input.name ?? before.name,
        kind: input.kind ?? before.kind,
        icon: input.icon ?? before.icon,
        colour: input.colour ?? before.colour,
        updatedAt: new Date(),
      }),
      project: (tx, row) => getCategory({ db: tx, id: row.id }),
    }),
  );
}
export async function removeCategory(args: { db: Db; actorUserId: AuthId; id: string }) {
  return removeFleetEntry({ ...args, table: contractingCategories, descriptor });
}
