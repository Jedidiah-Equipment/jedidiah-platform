import { createEscapedContainsSearchCondition, type DatabaseTransaction, type Db } from '@pkg/db';
import { contractingCategories, contractingImplements } from '@pkg/db/contracting';
import { implementCodePrefix, nextImplementCode } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import {
  FleetCode,
  type FleetListInput,
  FleetRetireInput,
  Implement,
  ImplementCodeSuggestion,
  type ImplementCreateInput,
  type ImplementPatchInput,
} from '@pkg/schema/contracting';
import { and, asc, eq, ilike, isNotNull, isNull, sql } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { assertCategoryKind } from './category-service.js';
import { assertNotRetired, FleetError, invalidCategory, withFleetConstraints } from './fleet-errors.js';
import { removeFleetEntry } from './remove-fleet-entry.js';

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
type RelatedRow = Row & { category: { name: string; icon: string; colour: string } };
function mapImplement(row: RelatedRow) {
  const { category, ...fields } = row;
  return Implement.parse({
    ...fields,
    categoryName: category.name,
    categoryIcon: category.icon,
    categoryColour: category.colour,
    retiredAt: row.retiredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
export async function listImplements({ db, input }: { db: Db; input: FleetListInput }) {
  const rows = await db.query.contractingImplements.findMany({
    where: and(
      input.status === 'active'
        ? isNull(contractingImplements.retiredAt)
        : input.status === 'retired'
          ? isNotNull(contractingImplements.retiredAt)
          : undefined,
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
  if (!row) throw new FleetError('fleet.not_found', 'Implement not found.');
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
      notFound: () => new FleetError('fleet.not_found', 'Implement not found.'),
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
export async function retireImplement({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: FleetRetireInput;
}) {
  const { id, reason } = FleetRetireInput.parse(input);
  return mutateEntity({
    db,
    actorUserId,
    descriptor,
    table: contractingImplements,
    id,
    notFound: () => new FleetError('fleet.not_found', 'Implement not found.'),
    assert: (_tx, row) => assertNotRetired(row),
    set: () => ({ retiredAt: new Date(), retiredReason: reason, updatedAt: new Date() }),
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
  if (!category) throw new FleetError('fleet.not_found', 'Category not found.');
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
