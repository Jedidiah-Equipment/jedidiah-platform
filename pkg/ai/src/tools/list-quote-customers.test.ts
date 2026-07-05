import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import type { CustomerListInput } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';
import { createActorUser, createAiContext } from '../test/ai-tools.js';
import { createTester } from '../test/create-tester.js';
import { createCustomerFixture } from '../test/domain-fixtures.js';
import { listQuoteCustomersTool } from './list-quote-customers.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'sales');

  return { db };
});

describe('listQuoteCustomersTool', () => {
  test('returns the same customer list result shape as quotes.customers', async ({ context }) => {
    await createCustomerFixture(context.db, 'Acme Mining', { email: 'sales@acme.example' });
    await createCustomerFixture(context.db, 'Beta Quarries', { email: 'orders@beta.example' });

    const input: CustomerListInput = {
      page: 1,
      pageSize: 10,
      columnFilters: {
        companyName: 'Acme',
      },
      search: 'sales',
      sortBy: 'companyName',
      sortDirection: 'asc',
    };
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      listQuoteCustomersTool.handler(input, createAiContext(context.db, access)),
      core.listCustomers({ db: context.db, input }),
    ]);

    expect(toolResult).toEqual(trpcResult);
  });

  test('treats null tool args as the default quote customer list input', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });
    const listCustomersSpy = vi.spyOn(core, 'listCustomers').mockResolvedValue({
      items: [],
      sortBy: 'companyName',
      sortDirection: 'asc',
      total: 0,
    });

    try {
      await listQuoteCustomersTool.handler(null, createAiContext(context.db, access));

      expect(listCustomersSpy).toHaveBeenCalledWith({
        db: context.db,
        input: expect.objectContaining({
          page: 1,
          pageSize: 10,
          search: '',
          sortBy: 'companyName',
          sortDirection: 'asc',
        }),
      });
    } finally {
      listCustomersSpy.mockRestore();
    }
  });

  test('rejects invalid quote customer list args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    await expect(
      listQuoteCustomersTool.handler({ sortBy: 'bad-sort' }, createAiContext(context.db, access)),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});
