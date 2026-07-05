import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { z } from 'zod';
import { createActorUser, createAiContext } from '../test/ai-tools.js';
import { createTester } from '../test/create-tester.js';
import { createJobFixture, createProductWithRangeFixture, createQuoteFixture } from '../test/domain-fixtures.js';
import { getJobTool } from './get-job.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'admin');
  const product = await createProductWithRangeFixture(db, 'Job Get Product');
  const quote = await createQuoteFixture(db, product.id, { status: 'accepted' });

  return { db, product, quote };
});

describe('getJobTool', () => {
  test('returns the same job detail shape as jobs.get', async ({ context }) => {
    const viewerAccess = createUserAccessSummary({
      role: 'job-viewer',
      userId: 'test-user-id',
    });
    const created = await createJobFixture(context.db, context.quote.id);

    const [toolResult, trpcResult] = await Promise.all([
      getJobTool.handler({ id: created.id }, createAiContext(context.db, viewerAccess)),
      core.getJob({ db: context.db, id: created.id }),
    ]);

    expect(toolResult).toEqual(trpcResult);
    expect(toolResult.schedule.map((item) => item.department)).toEqual([
      'procurement',
      'supply',
      'fabrication',
      'paint',
      'assembly',
    ]);
  });

  test('surfaces the core not-found message for missing jobs', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    await expect(
      getJobTool.handler(
        {
          id: '00000000-0000-4000-8000-000000000001',
        },
        createAiContext(context.db, access),
      ),
    ).rejects.toThrow('Job not found: 00000000-0000-4000-8000-000000000001');
  });

  test('rejects invalid job get args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    await expect(getJobTool.handler({ id: 'bad-id' }, createAiContext(context.db, access))).rejects.toBeInstanceOf(
      z.ZodError,
    );
  });
});
