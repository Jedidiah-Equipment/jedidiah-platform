import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { z } from 'zod';
import { createTester } from '@/test/create-tester.js';
import { createCustomerFixture } from '@/test/domain-fixtures.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { getCustomerDefinition, getCustomerTool } from './get-customer.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

describe('getCustomerTool', () => {
  test('returns the same customer result shape as customers.get', async ({ context }) => {
    const created = await createCustomerFixture(context.db, 'Acme Mining');
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      getCustomerTool.handler({ id: created.id }, createAiContext(context.db, access)),
      core.getCustomer({ db: context.db, id: created.id }),
    ]);

    expect(toolResult).toEqual(trpcResult);
  });

  test('surfaces the core not-found message for missing customers', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    await expect(
      getCustomerTool.handler(
        {
          id: '00000000-0000-4000-8000-000000000001',
        },
        createAiContext(context.db, access),
      ),
    ).rejects.toThrow('Customer not found: 00000000-0000-4000-8000-000000000001');
  });

  test('rejects invalid customer get args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    await expect(getCustomerTool.handler({ id: 'bad-id' }, createAiContext(context.db, access))).rejects.toBeInstanceOf(
      z.ZodError,
    );
  });

  test('projects Customer metadata using public labels', () => {
    expect(
      (getCustomerDefinition.projectResult as (value: unknown) => unknown)({
        companyName: 'Acme Mining',
        id: '00000000-0000-4000-8000-000000000005',
      }),
    ).toMatchObject({
      links: [
        {
          entity: 'Customer',
          href: '/customers/00000000-0000-4000-8000-000000000005/edit',
          label: 'Acme Mining',
        },
      ],
    });
  });
});
