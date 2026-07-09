import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { z } from 'zod';
import { createTester } from '@/test/create-tester.js';
import { createProductWithRangeFixture, createQuoteFixture } from '@/test/domain-fixtures.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import {
  getQuoteProductBayAvailabilityDefinition,
  getQuoteProductBayAvailabilityTool,
} from './get-quote-product-bay-availability.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  const product = await createProductWithRangeFixture(db, 'Availability Product');
  const quote = await createQuoteFixture(db, product.id);

  return { db, quote };
});

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('getQuoteProductBayAvailabilityTool', () => {
  test('is a quote:read read tool', () => {
    expect(getQuoteProductBayAvailabilityTool.requiredPermission).toBe('quote:read');
    expect(getQuoteProductBayAvailabilityDefinition.kind).toBe('read');
  });

  test('mirrors the quotes.productBayAvailability result', async ({ context }) => {
    const input = { quoteId: context.quote.id };

    const [toolResult, coreResult] = await Promise.all([
      getQuoteProductBayAvailabilityTool.handler(input, createAiContext(context.db, adminAccess)),
      core.getQuoteProductBayAvailability({ db: context.db, input }),
    ]);

    expect(toolResult).toEqual(coreResult);
  });

  test('rejects invalid args', async ({ context }) => {
    await expect(
      getQuoteProductBayAvailabilityTool.handler({ quoteId: 'bad-id' }, createAiContext(context.db, adminAccess)),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});
