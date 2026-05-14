import * as core from '@pkg/core';
import type { Database } from '@pkg/db';
import { user } from '@pkg/db/schema';
import { createUserAccessSummary } from '@pkg/domain';
import type { AppRole, UserAccessSummary } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/routes/ai/ai-context.js';
import { listUsersTool } from '@/routes/ai/tools/list-users.js';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(({ db }) => ({ db }));

function createAiContext(db: Database, access: UserAccessSummary): AiContext {
  return {
    access,
    db,
    session: mockSession(access.role ?? 'admin'),
  };
}

describe('listUsersTool', () => {
  test('returns the same user list result shape as users.list', async ({ context }) => {
    await createUser(context.db, {
      email: 'viewer@example.com',
      id: 'viewer-user-id',
      name: 'Viewer User',
      role: 'product-viewer',
    });
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      listUsersTool.handler({}, createAiContext(context.db, access)),
      context.createCaller().users.list(),
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

      expect(listUsersSpy).toHaveBeenCalledWith({ database: context.db });
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
});

async function createUser(
  db: Database,
  input: {
    email: string;
    emailVerified?: boolean;
    id: string;
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
    name: input.name,
    role: input.role,
    updatedAt: now,
  });
}
