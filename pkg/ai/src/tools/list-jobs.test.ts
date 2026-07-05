import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import type { JobListInput } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';
import { createActorUser, createAiContext } from '../test/ai-tools.js';
import { createTester } from '../test/create-tester.js';
import { createJobFixture, createProductWithRangeFixture, createQuoteFixture } from '../test/domain-fixtures.js';
import { listJobsTool } from './list-jobs.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'admin');
  const product = await createProductWithRangeFixture(db, 'Job Tool Product');
  const quote = await createQuoteFixture(db, product.id, { status: 'accepted' });

  return { db, product, quote };
});

describe('listJobsTool', () => {
  test('returns the same job list result shape as jobs.list', async ({ context }) => {
    const adminAccess = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });
    const created = await createJobFixture(context.db, context.quote.id);
    const input: JobListInput = {
      filters: {},
      page: 1,
      pageSize: 10,
      search: created.code,
      sortBy: 'code',
      sortDirection: 'asc',
    };

    const [toolResult, trpcResult] = await Promise.all([
      listJobsTool.handler(input, createAiContext(context.db, adminAccess)),
      core.listJobs({ db: context.db, input }),
    ]);

    expect(toolResult).toEqual(trpcResult);
  });

  test('treats null tool args as the default job list input', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });
    const listJobsSpy = vi.spyOn(core, 'listJobs').mockResolvedValue({
      items: [],
      sortBy: 'createdAt',
      sortDirection: 'asc',
      total: 0,
    });

    try {
      await listJobsTool.handler(null, createAiContext(context.db, access));

      expect(listJobsSpy).toHaveBeenCalledWith({
        db: context.db,
        input: expect.objectContaining({
          page: 1,
          pageSize: 10,
          search: '',
          sortBy: 'createdAt',
          sortDirection: 'asc',
        }),
      });
    } finally {
      listJobsSpy.mockRestore();
    }
  });

  test('rejects invalid job list args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    await expect(
      listJobsTool.handler({ sortBy: 'bad-sort' }, createAiContext(context.db, access)),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});
