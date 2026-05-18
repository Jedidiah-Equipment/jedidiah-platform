import * as core from '@pkg/core';
import { type Db, user } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { Customer, CustomerListInput, UserAccessSummary } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/routes/ai/ai-context.js';
import { listCustomersTool } from '@/routes/ai/tools/list-customers.js';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

describe('listCustomersTool', () => {
  test('returns the same customer list result shape as customers.list', async ({ context }) => {
    const caller = context.createCaller();
    await createCustomer(caller, 'Acme Mining', { email: 'sales@acme.example' });
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
    email: `${companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@example.com`,
    ...overrides,
  });
}

function createAiContext(db: Db, access: UserAccessSummary): AiContext {
  return {
    access,
    db,
    session: mockSession(access.role ?? 'admin'),
  };
}

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role: 'admin',
    updatedAt: now,
  });
}
