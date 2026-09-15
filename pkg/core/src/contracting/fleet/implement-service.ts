import { createEscapedContainsSearchCondition, type DatabaseTransaction, type Db } from '@pkg/db';
import { contractingCategories, contractingImplements } from '@pkg/db/contracting';
import { implementCodePrefix, nextImplementCode } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import {
  FleetCode,
  type FleetListInput,
  type FleetRetireInput,
  Implement,
  ImplementCodeSuggestion,
  type ImplementCreateInput,
  type ImplementPatchInput,
} from '@pkg/schema/contracting';
import { and, asc, eq, ilike, sql } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { assertCategoryKind } from './category-service.js';
import {
  type CategoryRelation,
  projectCategory,
  projectTimestamps,
  removeFleetEntry,
  retireFleetEntry,
  retirementFilter,
} from './fleet-entry.js';
import { assertNotRetired, invalidCategory, notFound, withFleetConstraints } from './fleet-errors.js';

type Row = typeof contractingImplements.$inferSelect;
const descriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_implement',
  noun: 'implement',
  primaryLabelField: 'code',
  entityId: (row) => row.id,
  toRecord: ({ id: _id, createdAt: _created, updatedAt: _updated, ...row }) => ({
    ...row,
    retiredAt: row.retiredAt?.toISOString() ?? null,
  }),
});
const related = { category: true } as const;
function mapImplement(row: Row & { category: CategoryRelation }) {
  const { category, ...fields } = row;
  return Implement.parse({ ...fields, ...projectCategory(category), ...projectTimestamps(row) });
}
export async function listImplements({ db, input }: { db: Db; input: FleetListInput }) {
  const rows = await db.query.contractingImplements.findMany({
    where: and(
      retirementFilter(contractingImplements, input.status),
      input.search ? createEscapedContainsSearchCondition(sql`${contractingImplements.code}`, input.search) : undefined,
    ),
    with: related,
    orderBy: [asc(contractingImplements.code)],
  });
  return rows.map(mapImplement);
}
export async function getImplement({ db, id }: { db: Db | DatabaseTransaction; id: string }) {
  const row = await db.query.contractingImplements.findFirst({
    where: eq(contractingImplements.id, id),
    with: related,
  });
  if (!row) throw notFound('Implement');
  return mapImplement(row);
}
export async function createImplement({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: ImplementCreateInput;
}) {
  return withFleetConstraints(() =>
    db.transaction(async (tx) => {
      await assertCategoryKind(tx, input.categoryId, 'implement');
      const [row] = await tx
        .insert(contractingImplements)
        .values({ ...input, code: FleetCode.parse(input.code) })
        .returning();
      if (!row) throw new Error('Implement insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor, input: row });
      return getImplement({ db: tx, id: row.id });
    }),
  );
}
export async function patchImplement({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: ImplementPatchInput;
}) {
  return withFleetConstraints(() =>
    mutateEntity({
      db,
      actorUserId,
      descriptor,
      table: contractingImplements,
      id: input.id,
      notFound: () => notFound('Implement'),
      assert: async (tx, row) => {
        assertNotRetired(row);
        if (input.categoryId !== undefined) await assertCategoryKind(tx, input.categoryId, 'implement');
      },
      set: (before) => ({
        code: input.code === undefined ? before.code : FleetCode.parse(input.code),
        categoryId: input.categoryId ?? before.categoryId,
        notes: input.notes === undefined ? before.notes : input.notes,
        updatedAt: new Date(),
      }),
      project: (tx, row) => getImplement({ db: tx, id: row.id }),
    }),
  );
}
export async function retireImplement(args: { db: Db; actorUserId: AuthId; input: FleetRetireInput }) {
  return retireFleetEntry({
    ...args,
    table: contractingImplements,
    descriptor,
    noun: 'Implement',
    project: (tx, row) => getImplement({ db: tx, id: row.id }),
  });
}
export async function removeImplement(args: { db: Db; actorUserId: AuthId; id: string }) {
  return removeFleetEntry({ ...args, table: contractingImplements, descriptor, assert: assertNotRetired });
}
/** `GRAVEL-TRAILER-3`: the category's prefix and one past its highest suffix, retired included. */
export async function suggestImplementCode({ db, categoryId }: { db: Db; categoryId: string }) {
  const [category] = await db
    .select({ name: contractingCategories.name, kind: contractingCategories.kind })
    .from(contractingCategories)
    .where(eq(contractingCategories.id, categoryId));
  if (!category) throw notFound('Category');
  if (category.kind !== 'implement') throw invalidCategory('implement');
  const prefix = implementCodePrefix(category.name);
  const taken = await db
    .select({ code: contractingImplements.code })
    .from(contractingImplements)
    .where(ilike(contractingImplements.code, `${prefix.replace(/[%_\\]/g, '\\$&')}-%`));
  return ImplementCodeSuggestion.parse({
    code: nextImplementCode(
      prefix,
      taken.map((row) => row.code),
    ),
  });
}
