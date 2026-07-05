import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { z } from 'zod';
import { createActorUser, createAiContext } from '../test/ai-tools.js';
import { createTester } from '../test/create-tester.js';
import { createProductWithRangeFixture, createQuoteFixture } from '../test/domain-fixtures.js';
import { getQuoteTool } from './get-quote.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'sales');
  const product = await createProductWithRangeFixture(db, 'Quote Get Product');

  return { db, product };
});

describe('getQuoteTool', () => {
  test('returns the same quote detail shape as quotes.get', async ({ context }) => {
    const created = await createQuoteFixture(context.db, context.product.id);
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      getQuoteTool.handler({ id: created.id }, createAiContext(context.db, access)),
      core.getQuote({ db: context.db, id: created.id }),
    ]);

    expect(toolResult).toEqual(trpcResult);
    expect(toolResult).toMatchObject({
      depositPercent: 30,
      plannedDeliveryDate: '2026-07-15',
      preferredDeliveryDate: '2026-07-10',
    });
  });

  test('surfaces the core not-found message for missing quotes', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    await expect(
      getQuoteTool.handler(
        {
          id: '00000000-0000-4000-8000-000000000001',
        },
        createAiContext(context.db, access),
      ),
    ).rejects.toThrow('Quote not found: 00000000-0000-4000-8000-000000000001');
  });

  test('rejects invalid quote get args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    await expect(getQuoteTool.handler({ id: 'bad-id' }, createAiContext(context.db, access))).rejects.toBeInstanceOf(
      z.ZodError,
    );
  });
});
