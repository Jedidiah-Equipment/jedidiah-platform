import { user } from '@pkg/db';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { db };
});

test('keeps Part Category admin to the roles that manage them', async ({ context }) => {
  for (const role of ['sales', 'stores'] as const) {
    const caller = context.createCaller(mockSession(role));
    await expect(caller.partCategories.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.partCategories.create({ name: 'Axle' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  }

  const procurement = context.createCaller(mockSession('procurement-manager'));
  const created = await procurement.partCategories.create({ name: 'Axle' });
  await expect(procurement.partCategories.update({ id: created.id, name: 'Axles' })).resolves.toMatchObject({
    name: 'Axles',
  });
  await expect(procurement.partCategories.create({ name: 'AXLES' })).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(procurement.partCategories.list()).resolves.toEqual([
    expect.objectContaining({ id: created.id, name: 'Axles', partCount: 0 }),
  ]);
});

test('serves Part Category names to any Part reader for pickers', async ({ context }) => {
  const created = await context.createCaller().partCategories.create({ name: 'Pipe' });

  await expect(context.createCaller(mockSession('procurement-manager')).parts.categories()).resolves.toEqual({
    categories: [{ id: created.id, name: 'Pipe' }],
  });
});
