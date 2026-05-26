import { auditEvents, type Db, user } from '@pkg/db';
import type { Product } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { expectIsoDatetime } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

async function createProduct(
  caller: AppRouterCaller,
  name: string,
  overrides: Partial<Parameters<AppRouterCaller['products']['create']>[0]> = {},
): Promise<Product> {
  return caller.products.create({
    basePrice: 1_000,
    description: null,
    leadTimeDays: 14,
    modelCode: createModelCode(name),
    name,
    ...overrides,
  });
}

function createModelCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

describe('products.create', () => {
  test('creates products', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Wheel Loader');

    expect(created).toMatchObject({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      description: null,
      leadTimeDays: 14,
      modelCode: 'WHEEL-LOADER',
      name: 'Wheel Loader',
    });
    expectIsoDatetime(created.createdAt);
    expectIsoDatetime(created.updatedAt);
  });
  test('rejects negative lead time days', async ({ context }) => {
    const caller = context.createCaller();

    await expect(
      caller.products.create({
        basePrice: 1_000,
        description: null,
        leadTimeDays: -1,
        modelCode: 'NEGATIVE-LEAD-TIME',
        name: 'Negative Lead Time',
      }),
    ).rejects.toThrow();
  });
});

describe('products.read', () => {
  test('returns lead time days on get and list', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Wheel Loader Read', { leadTimeDays: 21 });

    await expect(caller.products.get({ id: created.id })).resolves.toMatchObject({
      id: created.id,
      leadTimeDays: 21,
    });

    const list = await caller.products.list({
      page: 1,
      pageSize: 10,
    });

    expect(list.items).toContainEqual(expect.objectContaining({ id: created.id, leadTimeDays: 21 }));
  });
});

describe('products.update', () => {
  test('updates product catalog fields', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Wheel Loader Update');

    const updated = await caller.products.update({
      id: created.id,
      basePrice: 2_000,
      currencyCode: 'ZAR',
      description: 'Updated',
      leadTimeDays: 30,
      modelCode: 'WHEEL-LOADER-UPDATED',
      name: 'Wheel Loader Updated',
    });

    expect(updated).toMatchObject({
      basePrice: 2_000,
      description: 'Updated',
      leadTimeDays: 30,
      modelCode: 'WHEEL-LOADER-UPDATED',
      name: 'Wheel Loader Updated',
    });
    const events = await context.db.select().from(auditEvents);
    expect(events).not.toHaveLength(0);
    expect(events).toContainEqual(
      expect.objectContaining({
        changes: expect.objectContaining({
          leadTimeDays: {
            from: 14,
            to: 30,
          },
        }),
      }),
    );
  });
});

async function createActorUser(db: Db): Promise<void> {
  await db
    .insert(user)
    .values({
      id: 'test-user-id',
      email: 'actor@example.com',
      emailVerified: true,
      name: 'Actor',
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}
