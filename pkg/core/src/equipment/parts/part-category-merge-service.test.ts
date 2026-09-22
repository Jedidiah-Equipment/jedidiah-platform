import { auditEvents, createDatabaseClient, user } from '@pkg/db';
import { partCategories, parts, supplier } from '@pkg/db/equipment';
import { eq, inArray } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../../test/create-tester.js';
import { partValues } from '../test/part-fixtures.js';
import { getPartCategoryMergePreview, mergePartCategories } from './part-category-service.js';

const ACTOR_ID = 'part-category-merge-test-user';
const SUPPLIER_ID = '00000000-0000-4000-8000-000000000001';
const TARGET_ID = '00000000-0000-4000-8000-000000000101';
const BOLT_NUT_ID = '00000000-0000-4000-8000-000000000102';
const BOLTS_NUTS_ID = '00000000-0000-4000-8000-000000000103';
const EMPTY_ID = '00000000-0000-4000-8000-000000000104';
const OTHER_ID = '00000000-0000-4000-8000-000000000105';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000999';

const test = createTester(async ({ db }) => {
  const now = new Date();
  await db.insert(user).values({
    createdAt: now,
    email: 'part-category-merge@example.com',
    emailVerified: true,
    id: ACTOR_ID,
    name: 'Part Category Merge Tester',
    role: 'admin',
    updatedAt: now,
  });
  await db.insert(supplier).values({ companyName: 'Acme', id: SUPPLIER_ID });
  await db.insert(partCategories).values([
    { id: TARGET_ID, markupPercent: 25, name: 'Bolt & Nuts' },
    { id: BOLT_NUT_ID, markupPercent: 30, name: 'Bolt & Nut' },
    { id: BOLTS_NUTS_ID, name: 'Bolts & Nuts' },
    { id: EMPTY_ID, name: 'Bolt' },
    { id: OTHER_ID, name: 'Pipe' },
  ]);
  await db
    .insert(parts)
    .values([
      partValues({ categoryId: TARGET_ID, code: 'T-1', supplierId: SUPPLIER_ID, unitOfMeasure: 'piece' }),
      partValues({ categoryId: BOLT_NUT_ID, code: 'BN-1', supplierId: SUPPLIER_ID, unitOfMeasure: 'piece' }),
      partValues({ categoryId: BOLT_NUT_ID, code: 'BN-2', supplierId: SUPPLIER_ID, unitOfMeasure: 'piece' }),
      partValues({ categoryId: BOLTS_NUTS_ID, code: 'BSN-1', supplierId: SUPPLIER_ID, unitOfMeasure: 'piece' }),
      partValues({ categoryId: OTHER_ID, code: 'P-1', supplierId: SUPPLIER_ID, unitOfMeasure: 'piece' }),
    ]);

  return { db };
});

const threeIntoOne = { sourceIds: [BOLT_NUT_ID, BOLTS_NUTS_ID, EMPTY_ID], targetId: TARGET_ID };

describe('mergePartCategories', () => {
  test('moves every Part onto the survivor and deletes the duplicates, keeping the survivor as it was', async ({
    context,
  }) => {
    await expect(
      mergePartCategories({ actorUserId: ACTOR_ID, db: context.db, input: threeIntoOne }),
    ).resolves.toMatchObject({ id: TARGET_ID, markupPercent: 25, name: 'Bolt & Nuts', partCount: 4 });

    const rows = await context.db.select({ code: parts.code, categoryId: parts.categoryId }).from(parts);
    expect(Object.fromEntries(rows.map((row) => [row.code, row.categoryId]))).toEqual({
      'BN-1': TARGET_ID,
      'BN-2': TARGET_ID,
      'BSN-1': TARGET_ID,
      'P-1': OTHER_ID,
      'T-1': TARGET_ID,
    });
    await expect(context.db.$count(partCategories, inArray(partCategories.id, threeIntoOne.sourceIds))).resolves.toBe(
      0,
    );
  });

  test('records a merged event on each duplicate and one per duplicate on the survivor', async ({ context }) => {
    await mergePartCategories({ actorUserId: ACTOR_ID, db: context.db, input: threeIntoOne });

    const events = await context.db
      .select({ changes: auditEvents.changes, entityId: auditEvents.entityId, summary: auditEvents.summary })
      .from(auditEvents)
      .where(eq(auditEvents.action, 'merged'));
    expect(events).toHaveLength(6);
    expect(events).toEqual(
      expect.arrayContaining([
        {
          changes: {
            mergedIntoPartCategory: { from: 'Bolt & Nut', to: 'Bolt & Nuts' },
            movedParts: { from: null, to: 2 },
          },
          entityId: BOLT_NUT_ID,
          summary: "Merged part category 'Bolt & Nut' into 'Bolt & Nuts'",
        },
        {
          changes: {
            absorbedPartCategory: { from: 'Bolt & Nut', to: 'Bolt & Nuts' },
            movedParts: { from: null, to: 2 },
          },
          entityId: TARGET_ID,
          summary: "Absorbed part category 'Bolt & Nut' (2 parts)",
        },
        expect.objectContaining({ entityId: EMPTY_ID, summary: "Merged part category 'Bolt' into 'Bolt & Nuts'" }),
        expect.objectContaining({ entityId: TARGET_ID, summary: "Absorbed part category 'Bolt' (0 parts)" }),
      ]),
    );
  });

  test('refuses a merge into itself and moves nothing', async ({ context }) => {
    await expect(
      mergePartCategories({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { sourceIds: [BOLT_NUT_ID, TARGET_ID], targetId: TARGET_ID },
      }),
    ).rejects.toMatchObject({ code: 'part.category_merge_self' });
    await expect(context.db.$count(parts, eq(parts.categoryId, BOLT_NUT_ID))).resolves.toBe(2);
  });

  test('refuses an unknown Part Category and moves nothing', async ({ context }) => {
    await expect(
      mergePartCategories({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { sourceIds: [BOLT_NUT_ID, UNKNOWN_ID], targetId: TARGET_ID },
      }),
    ).rejects.toMatchObject({ code: 'part.category_not_found', metadata: { categoryId: UNKNOWN_ID } });
    await expect(
      mergePartCategories({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { sourceIds: [BOLT_NUT_ID], targetId: UNKNOWN_ID },
      }),
    ).rejects.toMatchObject({ code: 'part.category_not_found', metadata: { categoryId: UNKNOWN_ID } });

    await expect(context.db.$count(parts, eq(parts.categoryId, BOLT_NUT_ID))).resolves.toBe(2);
    await expect(context.db.$count(partCategories)).resolves.toBe(5);
    await expect(context.db.$count(auditEvents)).resolves.toBe(0);
  });

  test('settles two overlapping merges without deadlocking', async ({ context }) => {
    const first = createDatabaseClient(context.databaseUrl, { max: 1 });
    const second = createDatabaseClient(context.databaseUrl, { max: 1 });

    const results = await Promise.allSettled([
      mergePartCategories({
        actorUserId: ACTOR_ID,
        db: first.db,
        input: { sourceIds: [BOLT_NUT_ID, BOLTS_NUTS_ID], targetId: TARGET_ID },
      }),
      mergePartCategories({
        actorUserId: ACTOR_ID,
        db: second.db,
        input: { sourceIds: [BOLTS_NUTS_ID, BOLT_NUT_ID], targetId: OTHER_ID },
      }),
    ]);
    await Promise.all([first.close(), second.close()]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'part.category_not_found' },
    });
    await expect(context.db.$count(parts, inArray(parts.categoryId, [BOLT_NUT_ID, BOLTS_NUTS_ID]))).resolves.toBe(0);
  });
});

describe('getPartCategoryMergePreview', () => {
  test('shows every selected Part Category with its Parts and markup before anything moves', async ({ context }) => {
    const preview = await getPartCategoryMergePreview({ db: context.db, input: threeIntoOne });

    expect(preview.movedPartCount).toBe(3);
    expect(preview.target).toMatchObject({ id: TARGET_ID, markupPercent: 25, partCount: 1 });
    expect(preview.sources.map(({ id, markupPercent, partCount }) => ({ id, markupPercent, partCount }))).toEqual([
      { id: BOLT_NUT_ID, markupPercent: 30, partCount: 2 },
      { id: BOLTS_NUTS_ID, markupPercent: null, partCount: 1 },
      { id: EMPTY_ID, markupPercent: null, partCount: 0 },
    ]);
    await expect(context.db.$count(parts, eq(parts.categoryId, BOLT_NUT_ID))).resolves.toBe(2);
  });
});
