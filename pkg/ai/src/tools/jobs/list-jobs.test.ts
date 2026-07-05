import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import type { JobListInput } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';
import { createTester } from '@/test/create-tester.js';
import { createJobFixture, createProductWithRangeFixture, createQuoteFixture } from '@/test/domain-fixtures.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { listJobsDefinition, listJobsTool } from './list-jobs.js';

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

  test('projects Custom Job list items with null product fields and Work Title fallback', () => {
    const result = {
      items: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          code: 'JOB-00001',
          customerCompanyName: 'Apex Quarry Services',
          customerId: '00000000-0000-4000-8000-000000000005',
          productModelCode: null,
          productName: null,
          productSerialNumber: null,
          quoteCode: 'QUO-00002',
          quoteId: '00000000-0000-4000-8000-000000000002',
          quoteKind: 'custom',
          workTitle: 'Hydraulic repair',
        },
      ],
      total: 1,
    };

    const project = listJobsDefinition.projectResult as (value: unknown) => unknown;

    expect(project(result)).toEqual({
      ...result,
      items: [
        {
          ...result.items[0],
          links: [
            {
              entity: 'Job',
              href: '/jobs/00000000-0000-4000-8000-000000000001',
              label: 'JOB-00001',
            },
            {
              entity: 'Quote',
              href: '/quotes/00000000-0000-4000-8000-000000000002',
              label: 'QUO-00002',
            },
            {
              entity: 'Customer',
              href: '/customers/00000000-0000-4000-8000-000000000005/edit',
              label: 'Apex Quarry Services',
            },
          ],
        },
      ],
    });
  });
});
