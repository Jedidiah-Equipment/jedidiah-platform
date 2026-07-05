import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import type { CustomerListInput } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';
import { createTester } from '@/test/create-tester.js';
import { createCustomerFixture } from '@/test/domain-fixtures.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { listCustomersTool } from './list-customers.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

describe('listCustomersTool', () => {
  test('returns the same customer list result shape as customers.list', async ({ context }) => {
    await createCustomerFixture(context.db, 'Acme Mining', {
      email: 'sales@acme.example',
      thumbnailDataUrl: 'data:image/webp;base64,aaaa',
    });
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
      role: 'admin',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      listCustomersTool.handler(input, createAiContext(context.db, access)),
      core.listCustomers({ db: context.db, input }),
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
