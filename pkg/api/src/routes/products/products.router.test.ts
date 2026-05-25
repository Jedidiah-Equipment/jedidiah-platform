import { auditEvents, type Db, productOptions, user } from '@pkg/db';
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
      modelCode: 'WHEEL-LOADER',
      name: 'Wheel Loader',
      options: [],
    });
    expectIsoDatetime(created.createdAt);
    expectIsoDatetime(created.updatedAt);
  });

  test('creates products with options', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Wheel Loader With Options', {
      options: [
        { code: 'CAB', name: 'Enclosed Cab', price: 12_500 },
        { code: 'FORKS', name: 'Fork Attachment', price: 8_000 },
      ],
    });

    expect(created.options).toMatchObject([
      { code: 'CAB', name: 'Enclosed Cab', price: 12_500 },
      { code: 'FORKS', name: 'Fork Attachment', price: 8_000 },
    ]);
    await expect(context.db.select().from(productOptions)).resolves.toHaveLength(2);
  });
});

describe('products.update', () => {
  test('updates product catalog fields and options', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Wheel Loader Update', {
      options: [{ code: 'CAB', name: 'Enclosed Cab', price: 12_500 }],
    });

    const updated = await caller.products.update({
      id: created.id,
      basePrice: 2_000,
      currencyCode: 'ZAR',
      description: 'Updated',
      modelCode: 'WHEEL-LOADER-UPDATED',
      name: 'Wheel Loader Updated',
      options: created.options.map((option) => ({
        id: option.id,
        code: option.code,
        name: 'Updated Cab',
        price: 13_000,
      })),
    });

    expect(updated).toMatchObject({
      basePrice: 2_000,
      description: 'Updated',
      modelCode: 'WHEEL-LOADER-UPDATED',
      name: 'Wheel Loader Updated',
    });
    expect(updated.options).toMatchObject([{ code: 'CAB', name: 'Updated Cab', price: 13_000 }]);
    await expect(context.db.select().from(auditEvents)).resolves.not.toHaveLength(0);
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
