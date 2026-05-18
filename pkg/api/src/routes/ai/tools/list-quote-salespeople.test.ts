import * as core from '@pkg/core';
import { type Db, user } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/routes/ai/ai-context.js';
import { listQuoteSalespeopleTool } from '@/routes/ai/tools/list-quote-salespeople.js';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

describe('listQuoteSalespeopleTool', () => {
  test('returns the same salesperson list result shape as quotes.salespeople', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      listQuoteSalespeopleTool.handler({}, createAiContext(context.db, access)),
      caller.quotes.salespeople(),
    ]);

    expect(toolResult).toEqual(trpcResult);
  });

  test('treats null tool args as the default quote salesperson input', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });
    const listQuoteSalespeopleSpy = vi.spyOn(core, 'listQuoteSalespeople').mockResolvedValue({
      users: [],
    });

    try {
      await listQuoteSalespeopleTool.handler(null, createAiContext(context.db, access));

      expect(listQuoteSalespeopleSpy).toHaveBeenCalledWith({ db: context.db });
    } finally {
      listQuoteSalespeopleSpy.mockRestore();
    }
  });

  test('rejects invalid quote salesperson args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    await expect(
      listQuoteSalespeopleTool.handler('bad-args', createAiContext(context.db, access)),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});

function createAiContext(db: Db, access: UserAccessSummary): AiContext {
  return {
    access,
    db,
    session: mockSession(access.role ?? 'sales'),
  };
}

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role: 'sales',
    updatedAt: now,
  });
}
