import { type DatabaseTransaction, type Db, getUniqueViolationConstraint } from '@pkg/db';
import { partCategories, parts } from '@pkg/db/equipment';
import type { AuthId, UUID } from '@pkg/schema';
import type { PartCategory, PartCategoryCreateInput, PartCategoryUpdateInput } from '@pkg/schema/equipment';
import { PartCategory as PartCategorySchema } from '@pkg/schema/equipment';
import { asc, count, eq, type SQL, sql } from 'drizzle-orm';

import { defineAuditDescriptor, recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { DuplicatePartCategoryNameError, PartCategoryNotFoundError } from './part-errors.js';

type PartCategoryRow = typeof partCategories.$inferSelect;

export const partCategoryAuditDescriptor = defineAuditDescriptor<PartCategoryRow>({
  entityType: 'part_category',
  noun: 'part category',
  primaryLabelField: 'name',
  entityId: (row) => row.id,
  toRecord: (row) => ({ name: row.name }),
});

export async function listManagedPartCategories({ db }: { db: Db }): Promise<PartCategory[]> {
  const rows = await selectPartCategories(db).orderBy(asc(sql`lower(${partCategories.name})`), asc(partCategories.id));

  return rows.map(mapPartCategory);
}

export async function getPartCategory({ db, id }: { db: Db | DatabaseTransaction; id: UUID }): Promise<PartCategory> {
  const [row] = await selectPartCategories(db, eq(partCategories.id, id));
  if (!row) throw new PartCategoryNotFoundError(id);

  return mapPartCategory(row);
}

export async function createPartCategory({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PartCategoryCreateInput;
}): Promise<PartCategory> {
  try {
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(partCategories).values({ name: input.name }).returning();
      if (!created) throw new Error('Part Category insert did not return a row');

      await recordAuditCreate({ db: tx, descriptor: partCategoryAuditDescriptor, actorUserId, input: created });

      return created;
    });

    return mapPartCategory({ ...row, partCount: 0 });
  } catch (error) {
    throw mapPartCategoryUniqueViolation(error, input.name);
  }
}

export async function updatePartCategory({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PartCategoryUpdateInput;
}): Promise<PartCategory> {
  try {
    return await mutateEntity({
      actorUserId,
      db,
      descriptor: partCategoryAuditDescriptor,
      id: input.id,
      notFound: () => new PartCategoryNotFoundError(input.id),
      project: (tx, row) => getPartCategory({ db: tx, id: row.id }),
      set: () => ({ name: input.name, updatedAt: new Date() }),
      table: partCategories,
    });
  } catch (error) {
    throw mapPartCategoryUniqueViolation(error, input.name);
  }
}

function selectPartCategories(db: Db | DatabaseTransaction, where?: SQL) {
  return db
    .select({
      createdAt: partCategories.createdAt,
      id: partCategories.id,
      name: partCategories.name,
      partCount: count(parts.id),
      updatedAt: partCategories.updatedAt,
    })
    .from(partCategories)
    .leftJoin(parts, eq(parts.categoryId, partCategories.id))
    .where(where)
    .groupBy(partCategories.id)
    .$dynamic();
}

function mapPartCategory(row: PartCategoryRow & { partCount: number }): PartCategory {
  return PartCategorySchema.parse({
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    name: row.name,
    partCount: row.partCount,
    updatedAt: row.updatedAt.toISOString(),
  });
}

function mapPartCategoryUniqueViolation(error: unknown, name: string): Error {
  if (getUniqueViolationConstraint(error)?.includes('part_category_name_ci_unique')) {
    return new DuplicatePartCategoryNameError(name);
  }

  return error instanceof Error ? error : new Error(String(error));
}
