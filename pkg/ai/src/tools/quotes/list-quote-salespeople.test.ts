import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';
import { createTester } from '@/test/create-tester.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { listQuoteSalespeopleDefinition, listQuoteSalespeopleTool } from './list-quote-salespeople.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'sales');

  return { db };
});

describe('listQuoteSalespeopleTool', () => {
  test('returns the same salesperson list result shape as quotes.salespeople', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      listQuoteSalespeopleTool.handler({}, createAiContext(context.db, access)),
      core.listQuoteSalespeople({ db: context.db }),
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
    await expect(
      listQuoteSalespeopleTool.handler({ page: 1 }, createAiContext(context.db, access)),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  test('keeps salesperson list results as explicit identity projections', () => {
    const result = {
      users: [{ email: 'planner@example.com', id: 'user-id', name: 'Planner User' }],
    };

    expect((listQuoteSalespeopleDefinition.projectResult as (value: unknown) => unknown)(result)).toBe(result);
  });
});
