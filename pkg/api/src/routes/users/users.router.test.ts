import { type Db, user } from '@pkg/db';
import type { AppRole } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(({ db }) => ({ db }));

describe('users.list', () => {
  test('rejects unauthenticated user lists', async ({ context }) => {
    await expect(context.createAnonCaller().users.list()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('allows admins to list safe user summaries', async ({ context }) => {
    await createUser(context.db, {
      email: 'viewer@example.com',
      emailVerified: true,
      id: 'viewer-user-id',
      name: 'Viewer User',
      role: 'product-viewer',
    });

    const result = await context.createCaller().users.list();

    expect(result.users).toEqual([
      {
        email: 'viewer@example.com',
        emailVerified: true,
        id: 'viewer-user-id',
        name: 'Viewer User',
        role: 'product-viewer',
      },
    ]);
  });

  test('defaults unknown stored roles in list responses', async ({ context }) => {
    await createUser(context.db, {
      email: 'legacy@example.com',
      emailVerified: false,
      id: 'legacy-user-id',
      name: 'Legacy User',
      role: 'user',
    });

    const result = await context.createCaller().users.list();

    expect(result.users).toEqual([
      {
        email: 'legacy@example.com',
        emailVerified: false,
        id: 'legacy-user-id',
        name: 'Legacy User',
        role: 'product-viewer',
      },
    ]);
  });

  test('rejects product editors', async ({ context }) => {
    const caller = context.createCaller(mockSession('product-editor'));

    await expect(caller.users.list()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

async function createUser(
  db: Db,
  input: {
    email: string;
    emailVerified?: boolean;
    id: string;
    name: string;
    role: AppRole | string;
  },
) {
  const now = new Date();

  await db
    .insert(user)
    .values({
      email: input.email,
      emailVerified: input.emailVerified ?? true,
      id: input.id,
      name: input.name,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}
