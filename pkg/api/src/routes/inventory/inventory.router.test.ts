import { parts, supplier, user } from '@pkg/db';
import { describe, expect } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  const now = new Date('2026-08-01T08:00:00.000Z');
  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role: 'admin',
    updatedAt: now,
  });
  const [createdSupplier] = await db
    .insert(supplier)
    .values({ companyName: 'Inventory Supplier' })
    .returning({ id: supplier.id });

  if (!createdSupplier) {
    throw new Error('Supplier insert did not return a row');
  }

  const [part] = await db
    .insert(parts)
    .values({
      category: 'Bearings',
      code: 'P-100',
      description: 'Main bearing',
      finish: 'None',
      isInternallyFabricated: false,
      name: 'Bearing',
      supplierCode: 'SUP-100',
      supplierId: createdSupplier.id,
      unitOfMeasure: 'piece',
    })
    .returning();

  if (!part) {
    throw new Error('Part insert did not return a row');
  }

  return { part };
});

describe('inventory procedure permissions', () => {
  test('enforces read, adjust, and revalue permissions at their procedure boundaries', async ({ context }) => {
    await expect(context.createAnonCaller().inventory.stockOnHand()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(context.createCaller(mockSession('sales')).inventory.stockOnHand()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    await expect(
      context.createCaller(mockSession('stores')).inventory.postAdjustment({
        delta: 10,
        partId: context.part.id,
        reason: 'opening-balance',
        unitCost: 25,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      context.createCaller(mockSession('stores')).inventory.postAdjustment({
        delta: 10,
        partId: context.part.id,
        reason: 'opening-balance',
      }),
    ).resolves.toMatchObject({ actorUserId: 'test-user-id', movementType: 'adjustment', unitCost: null });

    await expect(
      context.createCaller(mockSession('procurement-manager')).inventory.postAdjustment({
        delta: 1,
        partId: context.part.id,
        reason: 'opening-balance',
        unitCost: 25,
      }),
    ).resolves.toMatchObject({ unitCost: 25 });

    await expect(
      context.createCaller(mockSession('stores')).inventory.postRevaluation({
        partId: context.part.id,
        unitCost: 30,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      context.createCaller(mockSession('procurement-manager')).inventory.postRevaluation({
        partId: context.part.id,
        unitCost: 30,
      }),
    ).resolves.toMatchObject({ movementType: 'revaluation', unitCost: 30 });
  });
});

describe('inventory cost projection', () => {
  test('returns the same SOH procedure with costs visible to a cost-reader and null to stores', async ({ context }) => {
    await context.createCaller().inventory.postAdjustment({
      delta: 10,
      partId: context.part.id,
      reason: 'opening-balance',
      unitCost: 25,
    });

    const procurement = await context.createCaller(mockSession('procurement-manager')).inventory.stockOnHand();
    const stores = await context.createCaller(mockSession('stores')).inventory.stockOnHand();

    expect(procurement.items[0]).toMatchObject({ averageUnitCost: 25, quantity: 10, totalValue: 250 });
    expect(stores.items[0]).toMatchObject({ averageUnitCost: null, quantity: 10, totalValue: null });
  });

  test('cost-gates stored and derived values in transaction history', async ({ context }) => {
    await context.createCaller().inventory.postAdjustment({
      delta: 10,
      partId: context.part.id,
      reason: 'opening-balance',
      unitCost: 25,
    });

    const procurement = await context
      .createCaller(mockSession('procurement-manager'))
      .inventory.history({ partId: context.part.id });
    const stores = await context.createCaller(mockSession('stores')).inventory.history({ partId: context.part.id });

    expect(procurement.items[0]).toMatchObject({ movementValue: 250, unitCost: 25 });
    expect(stores.items[0]).toMatchObject({ movementValue: null, unitCost: null });
  });

  test('cost-gates a revaluation response independently from revaluation authority', async ({ context }) => {
    const revaluerWithoutCostRead = context.createCaller(mockSession('procurement-manager'), {
      access: {
        permissions: ['inventory_cost:revalue'],
        role: 'procurement-manager',
        userId: 'test-user-id',
      },
    });

    await expect(
      revaluerWithoutCostRead.inventory.postRevaluation({ partId: context.part.id, unitCost: 0.104 }),
    ).resolves.toMatchObject({ movementType: 'revaluation', unitCost: null });
  });
});
