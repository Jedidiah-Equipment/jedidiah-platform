import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { z } from 'zod';
import { aiLinkMetadata } from '@/link-metadata.js';
import { createTester } from '@/test/create-tester.js';
import { createJobFixture, createProductWithRangeFixture, createQuoteFixture } from '@/test/domain-fixtures.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { getJobDefinition, getJobTool } from './get-job.js';

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

  test('projects Job and linked Quote and Customer metadata without mutating the base result', () => {
    const job = {
      id: '00000000-0000-4000-8000-000000000001',
      code: 'JOB-00001',
      customerCompanyName: 'Apex Quarry Services',
      customerId: '00000000-0000-4000-8000-000000000005',
      quoteCode: 'QUO-00002',
      quoteId: '00000000-0000-4000-8000-000000000002',
    };

    const project = getJobDefinition.projectResult as (result: unknown) => unknown;
    const projected = project(job);

    expect(projected).toEqual({
      ...job,
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
    });
    expect(job).not.toHaveProperty('links');
  });

  test('uses the shared route metadata for projected Job links', () => {
    expect(aiLinkMetadata.Job.href).toBe('/jobs/{id}');
    const project = getJobDefinition.projectResult as (result: unknown) => unknown;

    expect(project({ code: 'JOB-00001', id: 'job-id' })).toMatchObject({
      links: [{ href: '/jobs/job-id' }],
    });
  });

  test('keeps CFO part units in Job detail projections', () => {
    const job = {
      id: '00000000-0000-4000-8000-000000000001',
      code: 'JOB-00001',
      cfo: [
        {
          assemblyName: 'Hydraulics',
          kind: 'standard',
          parts: [
            {
              partCode: 'HOSE-001',
              partId: '00000000-0000-4000-8000-000000000010',
              partName: 'Hydraulic hose',
              quantity: 6000,
              unitOfMeasure: 'mm',
            },
          ],
        },
      ],
    };

    const project = getJobDefinition.projectResult as (result: unknown) => unknown;

    expect(project(job)).toMatchObject({
      cfo: [
        {
          parts: [
            {
              quantity: 6000,
              unitOfMeasure: 'mm',
            },
          ],
        },
      ],
    });
  });
});
