import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import type { QuoteListInput } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';
import { createTester } from '@/test/create-tester.js';
import { createProductWithRangeFixture, createQuoteFixture } from '@/test/domain-fixtures.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { listQuotesDefinition, listQuotesTool } from './list-quotes.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'sales');
  const product = await createProductWithRangeFixture(db, 'Quote List Product');

  return { db, product };
});

describe('listQuotesTool', () => {
  test('returns the same quote list result shape as quotes.list', async ({ context }) => {
    const created = await createQuoteFixture(context.db, context.product.id);
    const input: QuoteListInput = {
      filters: {
        statuses: ['draft'],
      },
      page: 1,
      pageSize: 10,
      search: created.code,
      sortBy: 'code',
      sortDirection: 'asc',
    };
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      listQuotesTool.handler(input, createAiContext(context.db, access)),
      core.listQuotes({ db: context.db, input }),
    ]);

    expect(toolResult).toEqual(trpcResult);
    expect(toolResult.items[0]).toMatchObject({
      depositPercent: 30,
      plannedDeliveryDate: '2026-07-15',
      preferredDeliveryDate: '2026-07-10',
    });
  });

  test('treats null tool args as the default quote list input', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });
    const listQuotesSpy = vi.spyOn(core, 'listQuotes').mockResolvedValue({
      items: [],
      sortBy: 'createdAt',
      sortDirection: 'desc',
      total: 0,
    });

    try {
      await listQuotesTool.handler(null, createAiContext(context.db, access));

      expect(listQuotesSpy).toHaveBeenCalledWith({
        db: context.db,
        input: expect.objectContaining({
          page: 1,
          pageSize: 10,
          search: '',
          sortBy: 'createdAt',
          sortDirection: 'desc',
        }),
      });
    } finally {
      listQuotesSpy.mockRestore();
    }
  });

  test('rejects invalid quote list args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    await expect(
      listQuotesTool.handler({ sortBy: 'bad-sort' }, createAiContext(context.db, access)),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  test('projects Quote and linked Job metadata to list items', () => {
    const result = {
      items: [
        {
          customerCompanyName: 'Apex Quarry Services',
          customerId: '00000000-0000-4000-8000-000000000005',
          id: '00000000-0000-4000-8000-000000000003',
          code: 'QUO-00003',
          job: {
            jobCode: 'JOB-00004',
            jobId: '00000000-0000-4000-8000-000000000004',
          },
          documentNotes: '30% deposit, balance on delivery',
          plannedDeliveryDate: '2026-07-15',
          product: {
            buildTimeDays: 14,
            currencyCode: 'ZAR',
            modelCode: 'JED-SS-003',
            name: 'Vertex Skid Steer 003',
          },
          productId: '00000000-0000-4000-8000-000000000006',
          preferredDeliveryDate: '2026-07-10',
          quotedBasePrice: 100000,
          quotedCurrencyCode: 'ZAR',
          salesPersonId: 'test-user-id',
          sentAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      total: 1,
    };

    const project = listQuotesDefinition.projectResult as (value: unknown) => unknown;

    expect(project(result)).toEqual({
      ...result,
      items: [
        {
          customerCompanyName: 'Apex Quarry Services',
          customerId: '00000000-0000-4000-8000-000000000005',
          id: '00000000-0000-4000-8000-000000000003',
          code: 'QUO-00003',
          job: {
            jobCode: 'JOB-00004',
            jobId: '00000000-0000-4000-8000-000000000004',
          },
          documentNotes: '30% deposit, balance on delivery',
          plannedDeliveryDate: '2026-07-15',
          product: {
            buildTimeDays: 14,
            currencyCode: 'ZAR',
            modelCode: 'JED-SS-003',
            name: 'Vertex Skid Steer 003',
          },
          productId: '00000000-0000-4000-8000-000000000006',
          preferredDeliveryDate: '2026-07-10',
          quotedBasePrice: 100000,
          quotedCurrencyCode: 'ZAR',
          salesPersonId: 'test-user-id',
          links: [
            {
              entity: 'Quote',
              href: '/quotes/00000000-0000-4000-8000-000000000003',
              label: 'QUO-00003',
            },
            {
              entity: 'Customer',
              href: '/customers/00000000-0000-4000-8000-000000000005/edit',
              label: 'Apex Quarry Services',
            },
            {
              entity: 'Product',
              href: '/products/00000000-0000-4000-8000-000000000006/edit',
              label: 'Vertex Skid Steer 003',
            },
            {
              entity: 'Job',
              href: '/jobs/00000000-0000-4000-8000-000000000004',
              label: 'JOB-00004',
            },
          ],
        },
      ],
    });
    expect(project(result)).not.toHaveProperty('items.0.sentAt');
  });
});
