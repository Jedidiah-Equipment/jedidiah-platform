import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import type { QuoteListInput } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';
import { createActorUser, createAiContext } from '../test/ai-tools.js';
import { createTester } from '../test/create-tester.js';
import { createProductWithRangeFixture, createQuoteFixture } from '../test/domain-fixtures.js';
import { listQuotesTool } from './list-quotes.js';

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
});
