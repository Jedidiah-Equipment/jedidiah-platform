import { type Db, user } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { Customer, UserAccessSummary } from '@pkg/schema';
import { describe, expect } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/routes/ai/ai-context.js';
import { getCustomerTool } from '@/routes/ai/tools/get-customer.js';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

describe('getCustomerTool', () => {
  test('returns the same customer result shape as customers.get', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createCustomer(caller, 'Acme Mining');
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      getCustomerTool.handler({ id: created.id }, createAiContext(context.db, access)),
      caller.customers.get({ id: created.id }),
    ]);

    expect(toolResult).toEqual(trpcResult);
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
});

async function createCustomer(caller: AppRouterCaller, companyName: string): Promise<Customer> {
  return caller.customers.create({
    companyName,
    email: `${companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@example.com`,
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
