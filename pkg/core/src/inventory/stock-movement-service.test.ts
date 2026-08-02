import type { Db } from '@pkg/db';
import { customers, jobCfoAssemblies, jobCfoParts, jobs, parts, quotes, stockMovements, supplier, user } from '@pkg/db';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import {
  getStockMovementHistory,
  listJobStock,
  listStockOnHand,
  postAdjustment,
  postCheckout,
  postReturnToStore,
  postRevaluation,
} from './stock-movement-service.js';

const actorUserId = 'inventory-test-user';

const test = createTester(async ({ db }) => {
  const now = new Date('2026-08-01T08:00:00.000Z');
  await db.insert(user).values({
    createdAt: now,
    email: 'inventory@example.com',
    emailVerified: true,
    id: actorUserId,
    name: 'Inventory Tester',
    role: 'admin',
    updatedAt: now,
  });
  const [createdSupplier] = await db
    .insert(supplier)
    .values({ companyName: 'Ledger Supplier' })
    .returning({ id: supplier.id });

  if (!createdSupplier) {
    throw new Error('Supplier insert did not return a row');
  }

  const seededParts = await seedParts(db, createdSupplier.id);
  const seededJobs = await seedJobs(db, seededParts.piece.id);
  return { jobs: seededJobs, parts: seededParts };
});

describe('Job stock movements', () => {
  test('rejects a movement against a cancelled Job', async ({ context }) => {
    await context.db
      .update(jobs)
      .set({ cancelledAt: new Date('2026-08-01T09:00:00.000Z') })
      .where(eq(jobs.id, context.jobs.custom.id));

    await expect(
      postCheckout({
        actorUserId,
        db: context.db,
        input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 1 },
      }),
    ).rejects.toMatchObject({ code: 'inventory.cancelled_job' });
  });

  test('posts an off-CFO checkout for a Custom Job and returns soft overdraw and negative-SOH warnings', async ({
    context,
  }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.measured.id, { delta: 1, unitCost: 12 }),
    });

    const result = await postCheckout({
      actorUserId,
      db: context.db,
      input: {
        jobId: context.jobs.custom.id,
        lengthMm: null,
        partId: context.parts.measured.id,
        quantity: 2,
      },
    });

    expect(result).toMatchObject({
      movement: {
        actorUserId,
        delta: -2,
        jobId: context.jobs.custom.id,
        movementType: 'checkout',
        reason: null,
        unitCost: 12,
      },
      warnings: { exceedsCfo: true, exceedsDrawn: false, negativeStockOnHand: true },
    });
  });

  test('enforces unit classes and stamps a linear draw with the selected piece cost', async ({ context }) => {
    await expect(
      postCheckout({
        actorUserId,
        db: context.db,
        input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 1.5 },
      }),
    ).rejects.toMatchObject({ code: 'inventory.invalid_delta' });

    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 2, lengthMm: 6_000, unitCost: 600 }),
    });
    const linear = await postCheckout({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: 3_000, partId: context.parts.linear.id, quantity: 1 },
    });
    const measured = await postCheckout({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.measured.id, quantity: 1.125 },
    });

    expect(linear.movement.unitCost).toBe(300);
    expect(measured.movement.delta).toBe(-1.125);
  });

  test('stamps returns from the outstanding draw value without valuing an over-return', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await postCheckout({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 2 },
    });
    await postRevaluation({
      actorUserId,
      db: context.db,
      input: { note: 'New average', partId: context.parts.piece.id, unitCost: 20 },
    });
    await postCheckout({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 1 },
    });

    const result = await postReturnToStore({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 4 },
    });

    expect(result.movement).toMatchObject({ delta: 4, movementType: 'return-to-store' });
    expect(result.movement.unitCost).toBe(10);
    expect(result.warnings).toEqual({ exceedsCfo: false, exceedsDrawn: true, negativeStockOnHand: false });
  });

  test('prices a later return from the still-drawn cost pool after an earlier draw was fully returned', async ({
    context,
  }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await postCheckout({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 2 },
    });
    await postReturnToStore({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 2 },
    });
    await postRevaluation({
      actorUserId,
      db: context.db,
      input: { note: 'New average', partId: context.parts.piece.id, unitCost: 20 },
    });
    await postCheckout({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 1 },
    });

    const result = await postReturnToStore({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 1 },
    });

    expect(result.movement.unitCost).toBe(20);
  });

  test('aggregates CFO rows, decays commitment on checkout, and re-opens it on return', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await postCheckout({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 4 },
    });

    expect(await listJobStock({ db: context.db, jobId: context.jobs.cfo.id })).toMatchObject({
      items: [
        {
          cfoQuantity: 5,
          committedQuantity: 1,
          drawnQuantity: 4,
          partId: context.parts.piece.id,
        },
      ],
    });

    await postReturnToStore({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 2 },
    });

    expect(await listJobStock({ db: context.db, jobId: context.jobs.cfo.id })).toMatchObject({
      items: [{ cfoQuantity: 5, committedQuantity: 3, drawnQuantity: 2 }],
    });
  });
});

describe('postAdjustment', () => {
  test('appends an adjustment with the authenticated actor', async ({ context }) => {
    const movement = await postAdjustment({
      actorUserId,
      db: context.db,
      input: {
        delta: 12,
        lengthMm: null,
        note: null,
        partId: context.parts.piece.id,
        reason: 'opening-balance',
        unitCost: 25,
      },
    });

    expect(movement).toMatchObject({
      actorUserId,
      delta: 12,
      lengthMm: null,
      movementType: 'adjustment',
      note: null,
      partId: context.parts.piece.id,
      reason: 'opening-balance',
      unitCost: 25,
    });
    expect(movement.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('accepts decimal deltas only for measured units', async ({ context }) => {
    await expect(
      postAdjustment({
        actorUserId,
        db: context.db,
        input: adjustmentInput(context.parts.piece.id, { delta: 1.5 }),
      }),
    ).rejects.toMatchObject({ code: 'inventory.invalid_delta' });
    await expect(
      postAdjustment({
        actorUserId,
        db: context.db,
        input: adjustmentInput(context.parts.linear.id, { delta: 1.5, lengthMm: 6_000 }),
      }),
    ).rejects.toMatchObject({ code: 'inventory.invalid_delta' });

    await expect(
      postAdjustment({
        actorUserId,
        db: context.db,
        input: adjustmentInput(context.parts.measured.id, { delta: 1.125 }),
      }),
    ).resolves.toMatchObject({ delta: 1.125 });
  });

  test('requires a length bucket only for linear adjustments', async ({ context }) => {
    await expect(
      postAdjustment({
        actorUserId,
        db: context.db,
        input: adjustmentInput(context.parts.linear.id),
      }),
    ).rejects.toMatchObject({ code: 'inventory.invalid_length', metadata: { requiresLength: true } });

    await expect(
      postAdjustment({
        actorUserId,
        db: context.db,
        input: adjustmentInput(context.parts.piece.id, { lengthMm: 6_000 }),
      }),
    ).rejects.toMatchObject({ code: 'inventory.invalid_length', metadata: { requiresLength: false } });
  });

  test('allows only opening balances and stock counts for periodic parts', async ({ context }) => {
    await expect(
      postAdjustment({
        actorUserId,
        db: context.db,
        input: adjustmentInput(context.parts.periodic.id, {
          delta: -1,
          lengthMm: 6_000,
          note: 'Damaged in storage',
          reason: 'damage',
        }),
      }),
    ).rejects.toMatchObject({ code: 'inventory.periodic_adjustment' });

    await expect(
      postAdjustment({
        actorUserId,
        db: context.db,
        input: adjustmentInput(context.parts.periodic.id, {
          delta: -1,
          lengthMm: 6_000,
          note: 'Weekly count',
          reason: 'stock-count',
        }),
      }),
    ).resolves.toMatchObject({ reason: 'stock-count' });
  });

  test('prevents positive material cost on an internally fabricated part', async ({ context }) => {
    await expect(
      postAdjustment({
        actorUserId,
        db: context.db,
        input: adjustmentInput(context.parts.fabricated.id, { unitCost: 10 }),
      }),
    ).rejects.toMatchObject({ code: 'inventory.fabricated_part_cost' });

    await expect(
      postAdjustment({
        actorUserId,
        db: context.db,
        input: adjustmentInput(context.parts.fabricated.id, { unitCost: 0 }),
      }),
    ).resolves.toMatchObject({ unitCost: 0 });
  });
});

describe('postRevaluation', () => {
  test('appends a zero-quantity cost-only row with the authenticated actor', async ({ context }) => {
    await expect(
      postRevaluation({
        actorUserId,
        db: context.db,
        input: {
          note: 'Supplier repriced before the next order',
          partId: context.parts.piece.id,
          unitCost: 31.5,
        },
      }),
    ).resolves.toMatchObject({
      actorUserId,
      delta: 0,
      lengthMm: null,
      movementType: 'revaluation',
      note: 'Supplier repriced before the next order',
      partId: context.parts.piece.id,
      reason: null,
      unitCost: 31.5,
    });
  });

  test('prevents a positive revaluation on an internally fabricated part', async ({ context }) => {
    await expect(
      postRevaluation({
        actorUserId,
        db: context.db,
        input: { note: null, partId: context.parts.fabricated.id, unitCost: 1 },
      }),
    ).rejects.toMatchObject({ code: 'inventory.fabricated_part_cost' });
  });
});

describe('stock movement database constraints', () => {
  test('rejects invalid per-type row shapes', async ({ context }) => {
    const invalidShapes = [
      {
        delta: -1,
        movementType: 'adjustment' as const,
        note: null,
        reason: 'damage' as const,
        unitCost: null,
      },
      {
        delta: -1,
        movementType: 'adjustment' as const,
        note: 'Damaged',
        reason: 'damage' as const,
        unitCost: 10,
      },
      {
        delta: 1,
        movementType: 'revaluation' as const,
        note: null,
        reason: null,
        unitCost: 10,
      },
      {
        delta: -1,
        jobId: null,
        movementType: 'checkout' as const,
        note: null,
        reason: null,
        unitCost: 10,
      },
      {
        delta: -1,
        jobId: context.jobs.cfo.id,
        movementType: 'return-to-store' as const,
        note: null,
        reason: null,
        unitCost: 10,
      },
    ];

    for (const invalidShape of invalidShapes) {
      await expect(
        context.db.insert(stockMovements).values({
          actorUserId,
          lengthMm: null,
          partId: context.parts.piece.id,
          ...invalidShape,
        }),
      ).rejects.toMatchObject({ cause: { constraint_name: 'stock_movement_shape' } });
    }
  });
});

describe('listStockOnHand', () => {
  test('subtracts commitments across Jobs to report free stock', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });

    const result = await listStockOnHand({ db: context.db });
    const piece = result.items.find((row) => row.partId === context.parts.piece.id);

    expect(piece).toMatchObject({ committed: 5, free: 5, quantity: 10 });
  });

  test('does not reserve free stock for a cancelled Job CFO', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await context.db
      .update(jobs)
      .set({ cancelledAt: new Date('2026-08-01T09:00:00.000Z') })
      .where(eq(jobs.id, context.jobs.cfo.id));

    const result = await listStockOnHand({ db: context.db });
    const piece = result.items.find((row) => row.partId === context.parts.piece.id);

    expect(piece).toMatchObject({ committed: 0, free: 10, quantity: 10 });
    await expect(listJobStock({ db: context.db, jobId: context.jobs.cfo.id })).resolves.toMatchObject({
      items: [{ cfoQuantity: 5, committedQuantity: 0 }],
    });
  });

  test('reports quantities, linear buckets, moving value, no-cost state, and periodic count age', async ({
    context,
  }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 20 }),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: -2, note: 'Damaged', reason: 'damage' }),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 2, lengthMm: 6_000, unitCost: 600 }),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 1, lengthMm: 3_000, unitCost: 360 }),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.periodic.id, { delta: 5, lengthMm: 6_000, unitCost: 600 }),
    });
    const count = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.periodic.id, {
        delta: -1,
        lengthMm: 6_000,
        note: 'Weekly count',
        reason: 'stock-count',
      }),
    });

    const result = await listStockOnHand({ db: context.db });
    const piece = result.items.find((row) => row.partId === context.parts.piece.id);
    const measured = result.items.find((row) => row.partId === context.parts.measured.id);
    const linear = result.items.filter((row) => row.partId === context.parts.linear.id);
    const periodic = result.items.find((row) => row.partId === context.parts.periodic.id);
    const fabricated = result.items.find((row) => row.partId === context.parts.fabricated.id);

    expect(piece).toMatchObject({ averageUnitCost: 20, lengthMm: null, quantity: 8, totalValue: 160 });
    expect(measured).toMatchObject({ averageUnitCost: null, lengthMm: null, quantity: 0, totalValue: null });
    expect(linear).toEqual([
      expect.objectContaining({ averageUnitCost: expect.closeTo(0.104, 10), lengthMm: 3_000, quantity: 1 }),
      expect.objectContaining({ averageUnitCost: expect.closeTo(0.104, 10), lengthMm: 6_000, quantity: 2 }),
    ]);
    expect(linear[0]?.totalValue).toBeCloseTo(312, 10);
    expect(linear[1]?.totalValue).toBeCloseTo(1_248, 10);
    expect(linear.map((row) => row.free)).toEqual([3, 3]);
    expect(periodic).toMatchObject({
      asOfLastCount: count.createdAt,
      lengthMm: 6_000,
      quantity: 4,
      stockTrackingMode: 'periodic',
      totalValue: 2_400,
    });
    expect(fabricated).toMatchObject({ averageUnitCost: 0, quantity: 0, totalValue: 0 });
  });

  test('omits revaluation-only buckets and carries the latest count across every Part bucket', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 2, lengthMm: 6_000, unitCost: 600 }),
    });
    await postRevaluation({
      actorUserId,
      db: context.db,
      input: { note: 'Current replacement cost', partId: context.parts.linear.id, unitCost: 0.104 },
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.periodic.id, { delta: 2, lengthMm: 3_000, unitCost: 300 }),
    });
    const count = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.periodic.id, {
        delta: 1,
        lengthMm: 6_000,
        note: 'Weekly count',
        reason: 'stock-count',
      }),
    });

    const result = await listStockOnHand({ db: context.db });
    const linear = result.items.filter((row) => row.partId === context.parts.linear.id);
    const periodic = result.items.filter((row) => row.partId === context.parts.periodic.id);

    expect(linear.map((row) => row.lengthMm)).toEqual([6_000]);
    expect(periodic.map((row) => row.asOfLastCount)).toEqual([count.createdAt, count.createdAt]);
  });
});

describe('getStockMovementHistory', () => {
  test('returns ledger order with a server-derived running balance, actor, and movement value', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 20 }),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: -2, note: 'Damaged', reason: 'damage' }),
    });
    await postRevaluation({
      actorUserId,
      db: context.db,
      input: { note: 'Supplier repriced', partId: context.parts.piece.id, unitCost: 30 },
    });

    const result = await getStockMovementHistory({ db: context.db, partId: context.parts.piece.id });

    expect(result.part).toEqual({
      code: 'PIECE',
      id: context.parts.piece.id,
      name: 'PIECE',
      unitOfMeasure: 'piece',
    });
    expect(result.items).toMatchObject([
      { actorName: 'Inventory Tester', movementValue: 200, runningBalance: 10, unitCost: 20 },
      { actorName: 'Inventory Tester', movementValue: -40, runningBalance: 8, unitCost: null },
      { actorName: 'Inventory Tester', movementValue: null, runningBalance: 8, unitCost: 30 },
    ]);
  });

  test('keeps stamped linear movement values and values fabricated movements at zero', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 2, lengthMm: 6_000, unitCost: 600 }),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 1, lengthMm: 3_000, unitCost: 360 }),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.fabricated.id, { delta: 2 }),
    });

    const linear = await getStockMovementHistory({ db: context.db, partId: context.parts.linear.id });
    const fabricated = await getStockMovementHistory({ db: context.db, partId: context.parts.fabricated.id });

    expect(linear.items.map((item) => item.movementValue)).toEqual([1_200, 360]);
    expect(fabricated.items[0]?.movementValue).toBe(0);
  });
});

function adjustmentInput(
  partId: string,
  overrides: Partial<Parameters<typeof postAdjustment>[0]['input']> = {},
): Parameters<typeof postAdjustment>[0]['input'] {
  return {
    delta: 1,
    lengthMm: null,
    note: null,
    partId,
    reason: 'opening-balance',
    unitCost: null,
    ...overrides,
  };
}

async function seedParts(db: Db, supplierId: string) {
  const [piece, linear, measured, periodic, fabricated] = await db
    .insert(parts)
    .values([
      partValues({ code: 'PIECE', supplierId, unitOfMeasure: 'piece' }),
      partValues({ code: 'LINEAR', standardPurchaseLengthMm: 6_000, supplierId, unitOfMeasure: 'mm' }),
      partValues({ code: 'MEASURED', supplierId, unitOfMeasure: 'kg' }),
      partValues({
        code: 'PERIODIC',
        standardPurchaseLengthMm: 6_000,
        stockTrackingMode: 'periodic',
        supplierId,
        unitOfMeasure: 'mm',
      }),
      partValues({ code: 'FABRICATED', isInternallyFabricated: true, supplierId, unitOfMeasure: 'piece' }),
    ])
    .returning();

  if (!piece || !linear || !measured || !periodic || !fabricated) {
    throw new Error('Part inserts did not return all rows');
  }

  return { fabricated, linear, measured, periodic, piece };
}

async function seedJobs(db: Db, cfoPartId: string) {
  const [customer] = await db.insert(customers).values({ companyName: 'Inventory Customer' }).returning();
  if (!customer) throw new Error('Customer insert did not return a row');

  const [cfoQuote, customQuote] = await db
    .insert(quotes)
    .values([
      {
        customerId: customer.id,
        kind: 'custom',
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: actorUserId,
        status: 'accepted',
        workTitle: 'CFO fabrication',
      },
      {
        customerId: customer.id,
        kind: 'custom',
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: actorUserId,
        status: 'accepted',
        workTitle: 'Off-CFO repair',
      },
    ])
    .returning();
  if (!cfoQuote || !customQuote) throw new Error('Quote inserts did not return rows');

  const [cfo, custom] = await db
    .insert(jobs)
    .values([{ quoteId: cfoQuote.id }, { quoteId: customQuote.id }])
    .returning();
  if (!cfo || !custom) throw new Error('Job inserts did not return rows');

  const assemblies = await db
    .insert(jobCfoAssemblies)
    .values([
      { assemblyName: 'First assembly', jobId: cfo.id, kind: 'standard', sequence: 0 },
      { assemblyName: 'Second assembly', jobId: cfo.id, kind: 'optional', sequence: 1 },
    ])
    .returning();
  const [firstAssembly, secondAssembly] = assemblies;
  if (!firstAssembly || !secondAssembly) throw new Error('CFO assembly inserts did not return rows');

  await db.insert(jobCfoParts).values([
    { cfoAssemblyId: firstAssembly.id, partId: cfoPartId, quantity: 3 },
    { cfoAssemblyId: secondAssembly.id, partId: cfoPartId, quantity: 2 },
  ]);

  return { cfo, custom };
}

function partValues({
  code,
  isInternallyFabricated = false,
  standardPurchaseLengthMm = null,
  stockTrackingMode = 'perpetual',
  supplierId,
  unitOfMeasure,
}: {
  code: string;
  isInternallyFabricated?: boolean;
  standardPurchaseLengthMm?: number | null;
  stockTrackingMode?: 'periodic' | 'perpetual';
  supplierId: string;
  unitOfMeasure: 'kg' | 'mm' | 'piece';
}) {
  return {
    category: 'Test',
    code,
    description: `${code} description`,
    finish: 'None',
    isInternallyFabricated,
    name: code,
    standardPurchaseLengthMm,
    stockTrackingMode,
    supplierCode: code,
    supplierId,
    unitOfMeasure,
  };
}
