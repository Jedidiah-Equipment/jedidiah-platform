import { auditEvents, type Db, user } from '@pkg/db';
import { partCategories, parts, supplier } from '@pkg/db/equipment';
import { PartCategoryUpdateInput } from '@pkg/schema/equipment';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../../test/create-tester.js';
import { partValues } from '../test/part-fixtures.js';
import {
  createPartCategory,
  getPartCategory,
  listManagedPartCategories,
  updatePartCategory,
} from './part-category-service.js';

const actorUserId = 'test-user-id';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

describe('Part Category admin', () => {
  test('creates a Part Category and records who added it', async ({ context }) => {
    const created = await createPartCategory({ actorUserId, db: context.db, input: { name: 'Bolt & Nuts' } });

    expect(created).toMatchObject({ markupPercent: null, name: 'Bolt & Nuts', partCount: 0 });
    await expect(context.db.select().from(auditEvents).where(eq(auditEvents.entityId, created.id))).resolves.toEqual([
      expect.objectContaining({ action: 'created', actorUserId, entityType: 'part_category' }),
    ]);
  });

  test('renames a Part Category and audits the change', async ({ context }) => {
    const created = await createPartCategory({ actorUserId, db: context.db, input: { name: 'Light' } });

    const renamed = await updatePartCategory({
      actorUserId,
      db: context.db,
      input: { id: created.id, markupPercent: null, name: 'Lights' },
    });

    expect(renamed).toMatchObject({ id: created.id, name: 'Lights' });
    await expect(getPartCategory({ db: context.db, id: created.id })).resolves.toMatchObject({ name: 'Lights' });
    const events = await context.db.select().from(auditEvents).where(eq(auditEvents.entityId, created.id));
    expect(events.at(-1)).toMatchObject({ action: 'updated', changes: { name: { from: 'Light', to: 'Lights' } } });
  });

  test('sets and clears a markup, auditing both changes', async ({ context }) => {
    const created = await createPartCategory({ actorUserId, db: context.db, input: { name: 'Bolt & Nuts' } });

    await expect(
      updatePartCategory({
        actorUserId,
        db: context.db,
        input: { id: created.id, markupPercent: 25, name: 'Bolt & Nuts' },
      }),
    ).resolves.toMatchObject({ markupPercent: 25 });
    await expect(
      updatePartCategory({
        actorUserId,
        db: context.db,
        input: { id: created.id, markupPercent: null, name: 'Bolt & Nuts' },
      }),
    ).resolves.toMatchObject({ markupPercent: null });

    const events = await context.db.select().from(auditEvents).where(eq(auditEvents.entityId, created.id));
    expect(events.slice(1).map((event) => event.changes)).toEqual([
      { markupPercent: { from: null, to: 25 } },
      { markupPercent: { from: 25, to: null } },
    ]);
  });

  test('refuses a negative markup in the contract and in the database', async ({ context }) => {
    const created = await createPartCategory({ actorUserId, db: context.db, input: { name: 'Pipe' } });

    expect(PartCategoryUpdateInput.safeParse({ id: created.id, markupPercent: -1, name: 'Pipe' }).success).toBe(false);
    await expect(
      context.db.update(partCategories).set({ markupPercent: -1 }).where(eq(partCategories.id, created.id)),
    ).rejects.toMatchObject({ cause: { constraint_name: 'part_category_markup_percent_nonnegative' } });
  });

  test('refuses a name another Part Category already has, ignoring casing', async ({ context }) => {
    await createPartCategory({ actorUserId, db: context.db, input: { name: 'Axle' } });
    const other = await createPartCategory({ actorUserId, db: context.db, input: { name: 'Hubs' } });

    await expect(createPartCategory({ actorUserId, db: context.db, input: { name: 'axle' } })).rejects.toMatchObject({
      code: 'part.category_name_taken',
    });
    await expect(
      updatePartCategory({ actorUserId, db: context.db, input: { id: other.id, markupPercent: null, name: 'AXLE' } }),
    ).rejects.toMatchObject({ code: 'part.category_name_taken' });
  });

  test('lists every Part Category by name with how many Parts it holds', async ({ context }) => {
    const pipe = await createPartCategory({ actorUserId, db: context.db, input: { name: 'Pipe' } });
    await createPartCategory({ actorUserId, db: context.db, input: { name: 'axle' } });
    const [partSupplier] = await context.db.insert(supplier).values({ companyName: 'Acme' }).returning();
    if (!partSupplier) throw new Error('Supplier insert did not return a row');
    await context.db
      .insert(parts)
      .values([
        partValues({ categoryId: pipe.id, code: 'P-1', supplierId: partSupplier.id, unitOfMeasure: 'piece' }),
        partValues({ categoryId: pipe.id, code: 'P-2', supplierId: partSupplier.id, unitOfMeasure: 'piece' }),
      ]);

    const categories = await listManagedPartCategories({ db: context.db });

    expect(categories.map(({ name, partCount }) => [name, partCount])).toEqual([
      ['axle', 0],
      ['Pipe', 2],
    ]);
  });

  test('reports a Part Category that does not exist', async ({ context }) => {
    await expect(getPartCategory({ db: context.db, id: '00000000-0000-4000-8000-000000000999' })).rejects.toMatchObject(
      { code: 'part.category_not_found' },
    );
  });
});

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: actorUserId,
    name: 'Test User',
    role: 'admin',
    updatedAt: now,
  });
}
