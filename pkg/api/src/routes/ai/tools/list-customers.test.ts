import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import type { Customer, CustomerListInput } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';

import { listCustomersTool } from '@/routes/ai/tools/list-customers.js';
import { createActorUser, createAiContext, createEmail } from '@/test/ai-tools.js';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

describe('listCustomersTool', () => {
  test('returns the same customer list result shape as customers.list', async ({ context }) => {
    const caller = context.createCaller();
    await createCustomer(caller, 'Acme Mining', {
      email: 'sales@acme.example',
      thumbnailDataUrl: 'data:image/webp;base64,aaaa',
    });
    await createCustomer(caller, 'Beta Quarries', { email: 'orders@beta.example' });

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
      role: 'admin',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      listCustomersTool.handler(input, createAiContext(context.db, access)),
      caller.customers.list(input),
    ]);

    expect(toolResult).toEqual(trpcResult);
  });

  test('treats null tool args as the default customer list input', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });
    const listCustomersSpy = vi.spyOn(core, 'listCustomers').mockResolvedValue({
      items: [],
      sortBy: 'companyName',
      sortDirection: 'asc',
      total: 0,
    });

    try {
      await listCustomersTool.handler(null, createAiContext(context.db, access));

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

  test('rejects invalid customer list args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    await expect(
      listCustomersTool.handler({ sortBy: 'bad-sort' }, createAiContext(context.db, access)),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});

async function createCustomer(
  caller: AppRouterCaller,
  companyName: string,
  overrides: Partial<Parameters<AppRouterCaller['customers']['create']>[0]> = {},
): Promise<Customer> {
  return caller.customers.create({
    companyName,
    email: createEmail(companyName),
    ...overrides,
  });
}
