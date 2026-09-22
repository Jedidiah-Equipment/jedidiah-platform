import { type DatabaseTransaction, type Db, getUniqueViolationConstraint } from '@pkg/db';
import { partCategories, parts } from '@pkg/db/equipment';
import type { AuthId, UUID } from '@pkg/schema';
import type {
  PartCategory,
  PartCategoryCreateInput,
  PartCategoryMergeInput,
  PartCategoryMergePreview,
  PartCategoryUpdateInput,
} from '@pkg/schema/equipment';
import { PartCategory as PartCategorySchema } from '@pkg/schema/equipment';
import { asc, count, eq, inArray, type SQL, sql } from 'drizzle-orm';

import { defineAuditDescriptor, recordAuditCreate, recordAuditEvent } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import {
  DuplicatePartCategoryNameError,
  PartCategoryMergeSelfError,
  PartCategoryNotFoundError,
} from './part-errors.js';

type PartCategoryRow = typeof partCategories.$inferSelect;

export const partCategoryAuditDescriptor = defineAuditDescriptor<PartCategoryRow>({
  entityType: 'part_category',
  noun: 'part category',
  primaryLabelField: 'name',
  entityId: (row) => row.id,
  toRecord: (row) => ({ markupPercent: row.markupPercent, name: row.name }),
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
      set: () => ({ markupPercent: input.markupPercent, name: input.name, updatedAt: new Date() }),
      table: partCategories,
    });
  } catch (error) {
    throw mapPartCategoryUniqueViolation(error, input.name);
  }
}

export async function getPartCategoryMergePreview({
  db,
  input,
}: {
  db: Db;
  input: PartCategoryMergeInput;
}): Promise<PartCategoryMergePreview> {
  const { sourceIds, targetId } = input;
  if (sourceIds.includes(targetId)) throw new PartCategoryMergeSelfError(targetId);

  const rows = (await selectPartCategories(db, inArray(partCategories.id, [...sourceIds, targetId]))).map(
    mapPartCategory,
  );
  const target = findPartCategory(rows, targetId);
  const sources = sourceIds.map((id) => findPartCategory(rows, id));

  return {
    movedPartCount: sources.reduce((total, source) => total + source.partCount, 0),
    sources,
    target,
  };
}

/**
 * Many into one: every Part on the duplicates moves to the survivor and the duplicates are deleted.
 * The survivor keeps its own name and markup; nothing is copied from a duplicate.
 */
export async function mergePartCategories({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PartCategoryMergeInput;
}): Promise<PartCategory> {
  const { sourceIds, targetId } = input;
  if (sourceIds.includes(targetId)) throw new PartCategoryMergeSelfError(targetId);

  return db.transaction(async (tx) => {
    // Part edits start at the Part row, so take the Part locks before any Part Category lock.
    await tx
      .select({ id: parts.id })
      .from(parts)
      .where(inArray(parts.categoryId, sourceIds))
      .orderBy(parts.id)
      .for('update');

    // One statement locks every Part Category involved, so concurrent merges cannot disagree on lock order.
    const rows = await tx
      .select()
      .from(partCategories)
      .where(inArray(partCategories.id, [...sourceIds, targetId]))
      .orderBy(partCategories.id)
      .for('update');
    const target = findPartCategory(rows, targetId);
    const sources = sourceIds.map((id) => findPartCategory(rows, id));

    for (const source of sources) {
      const moved = await tx
        .update(parts)
        .set({ categoryId: targetId })
        .where(eq(parts.categoryId, source.id))
        .returning({ id: parts.id });
      await tx.delete(partCategories).where(eq(partCategories.id, source.id));

      const counts = { movedParts: { from: null, to: moved.length } };
      await recordAuditEvent({
        db: tx,
        descriptor: partCategoryAuditDescriptor,
        action: 'merged',
        actorUserId,
        entityId: source.id,
        changes: { mergedIntoPartCategory: { from: source.name, to: target.name }, ...counts },
        record: partCategoryAuditDescriptor.toRecord(source),
        summary: `Merged part category '${source.name}' into '${target.name}'`,
      });
      await recordAuditEvent({
        db: tx,
        descriptor: partCategoryAuditDescriptor,
        action: 'merged',
        actorUserId,
        entityId: targetId,
        changes: { absorbedPartCategory: { from: source.name, to: target.name }, ...counts },
        record: partCategoryAuditDescriptor.toRecord(target),
        summary: `Absorbed part category '${source.name}' (${moved.length} parts)`,
      });
    }

    await tx.update(partCategories).set({ updatedAt: new Date() }).where(eq(partCategories.id, targetId));

    return getPartCategory({ db: tx, id: targetId });
  });
}

function findPartCategory<Row extends { id: string }>(rows: readonly Row[], id: UUID): Row {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) throw new PartCategoryNotFoundError(id);

  return row;
}

function selectPartCategories(db: Db | DatabaseTransaction, where?: SQL) {
  return db
    .select({
      createdAt: partCategories.createdAt,
      id: partCategories.id,
      markupPercent: partCategories.markupPercent,
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
    markupPercent: row.markupPercent,
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
