import * as core from '@pkg/core';
import { type Db, user } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { AppRole } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';
import { createTester } from '@/test/create-tester.js';
import { createAiContext } from '@/test/tools.js';
import { listUsersDefinition, listUsersTool } from './list-users.js';

const test = createTester(({ db }) => ({ db }));

describe('listUsersTool', () => {
  test('returns the same user list result shape as users.list', async ({ context }) => {
    await createUser(context.db, {
      email: 'viewer@example.com',
      id: 'viewer-user-id',
      image: 'data:image/webp;base64,aaaa',
      name: 'Viewer User',
      role: 'sales',
    });
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      listUsersTool.handler({}, createAiContext(context.db, access)),
      core.listUsers({ db: context.db }),
    ]);

    expect(toolResult).toEqual(trpcResult);
  });

  test('treats null tool args as the default user list input', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });
    const listUsersSpy = vi.spyOn(core, 'listUsers').mockResolvedValue({
      users: [],
    });

    try {
      await listUsersTool.handler(null, createAiContext(context.db, access));

      expect(listUsersSpy).toHaveBeenCalledWith({ db: context.db });
    } finally {
      listUsersSpy.mockRestore();
    }
  });

  test('rejects invalid user list args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    await expect(listUsersTool.handler('bad-args', createAiContext(context.db, access))).rejects.toBeInstanceOf(
      z.ZodError,
    );
  });

  test('keeps User list results as explicit identity projections', () => {
    const result = {
      users: [{ email: 'planner@example.com', id: 'user-id', name: 'Planner User' }],
    };

    expect((listUsersDefinition.projectResult as (value: unknown) => unknown)(result)).toBe(result);
  });
});

async function createUser(
  db: Db,
  input: {
    email: string;
    emailVerified?: boolean;
    id: string;
    image?: string | null;
    name: string;
    role: AppRole | string;
  },
) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: input.email,
    emailVerified: input.emailVerified ?? true,
    id: input.id,
    image: input.image ?? null,
    name: input.name,
    role: input.role,
    updatedAt: now,
  });
}
