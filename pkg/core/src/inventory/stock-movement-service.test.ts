import type { Db } from '@pkg/db';
import {
  customers,
  jobCfoAssemblies,
  jobCfoParts,
  jobs,
  parts,
  purchaseOrderLines,
  purchaseOrders,
  quotes,
  stockMovements,
  supplier,
  user,
} from '@pkg/db';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import {
  getStockMovementHistory,
  listJobStock,
  listStockOnHand,
  postAdjustment,
  postJobMovement,
  postReceipt,
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
  return { jobs: seededJobs, parts: seededParts, supplierId: createdSupplier.id };
});

describe('Job stock movements', () => {
  test('rejects checkout but allows cost-preserving returns after a Job is cancelled', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 2, unitCost: 10 }),
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 1 },
      movementType: 'checkout',
    });
    await context.db
      .update(jobs)
      .set({ cancelledAt: new Date('2026-08-01T09:00:00.000Z') })
      .where(eq(jobs.id, context.jobs.custom.id));

    await expect(
      postJobMovement({
        actorUserId,
        db: context.db,
        input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 1 },
        movementType: 'checkout',
      }),
    ).rejects.toMatchObject({ code: 'job.cancelled' });

    await expect(
      postJobMovement({
        actorUserId,
        db: context.db,
        input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 1 },
        movementType: 'return-to-store',
      }),
    ).resolves.toMatchObject({ movement: { unitCost: 10 }, warnings: [] });
  });

  test('posts an off-CFO checkout for a Custom Job and returns soft overdraw and negative-SOH warnings', async ({
    context,
  }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.measured.id, { delta: 1, unitCost: 12 }),
    });

    const result = await postJobMovement({
      actorUserId,
      db: context.db,
      input: {
        jobId: context.jobs.custom.id,
        lengthMm: null,
        partId: context.parts.measured.id,
        quantity: 2,
      },
      movementType: 'checkout',
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
      warnings: ['exceeds-cfo', 'negative-stock-on-hand'],
    });
  });

  test('enforces unit classes and stamps a linear draw with the selected piece cost', async ({ context }) => {
    await expect(
      postJobMovement({
        actorUserId,
        db: context.db,
        input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 1.5 },
        movementType: 'checkout',
      }),
    ).rejects.toMatchObject({ code: 'inventory.invalid_delta' });

    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 2, lengthMm: 6_000, unitCost: 600 }),
    });
    const linear = await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: 3_000, partId: context.parts.linear.id, quantity: 1 },
      movementType: 'checkout',
    });
    const measured = await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.measured.id, quantity: 1.125 },
      movementType: 'checkout',
    });

    expect(linear.movement.unitCost).toBe(300);
    expect(measured.movement.delta).toBe(-1.125);
  });

  test('returns linear stock at its matching length-bucket cost and reports the net buckets', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 2, lengthMm: 6_000, unitCost: 600 }),
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: 6_000, partId: context.parts.linear.id, quantity: 1 },
      movementType: 'checkout',
    });
    await postRevaluation({
      actorUserId,
      db: context.db,
      input: { note: 'Repriced linear stock', partId: context.parts.linear.id, unitCost: 0.3 },
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: 3_000, partId: context.parts.linear.id, quantity: 1 },
      movementType: 'checkout',
    });

    const returned = await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: 3_000, partId: context.parts.linear.id, quantity: 1 },
      movementType: 'return-to-store',
    });
    const jobStock = await listJobStock({ db: context.db, jobId: context.jobs.custom.id });
    const stockOnHand = await listStockOnHand({ db: context.db });
    const linear = stockOnHand.items.filter((row) => row.partId === context.parts.linear.id);

    expect(returned.movement.unitCost).toBe(900);
    expect(jobStock.items[0]?.lengthBuckets).toEqual([
      { drawnQuantity: 0, lengthMm: 3_000 },
      { drawnQuantity: 1, lengthMm: 6_000 },
    ]);
    expect(linear[0]?.averageUnitCost).toBeCloseTo(0.3, 10);
  });

  test('keeps a return uncosted when its outstanding draw had no cost', async ({ context }) => {
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.measured.id, quantity: 1 },
      movementType: 'checkout',
    });

    await expect(
      postJobMovement({
        actorUserId,
        db: context.db,
        input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.measured.id, quantity: 1 },
        movementType: 'return-to-store',
      }),
    ).resolves.toMatchObject({ movement: { unitCost: null } });
  });

  test('stamps returns from the outstanding draw value without valuing an over-return', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 2 },
      movementType: 'checkout',
    });
    await postRevaluation({
      actorUserId,
      db: context.db,
      input: { note: 'New average', partId: context.parts.piece.id, unitCost: 20 },
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 1 },
      movementType: 'checkout',
    });

    const result = await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 4 },
      movementType: 'return-to-store',
    });

    expect(result.movement).toMatchObject({ delta: 4, movementType: 'return-to-store' });
    expect(result.movement.unitCost).toBe(10);
    expect(result.warnings).toEqual(['exceeds-drawn']);
  });

  test('prices a later return from the still-drawn cost pool after an earlier draw was fully returned', async ({
    context,
  }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 2 },
      movementType: 'checkout',
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 2 },
      movementType: 'return-to-store',
    });
    await postRevaluation({
      actorUserId,
      db: context.db,
      input: { note: 'New average', partId: context.parts.piece.id, unitCost: 20 },
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 1 },
      movementType: 'checkout',
    });

    const result = await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 1 },
      movementType: 'return-to-store',
    });

    expect(result.movement.unitCost).toBe(20);
  });

  test('aggregates CFO rows, decays commitment on checkout, and re-opens it on return', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 4 },
      movementType: 'checkout',
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

    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 2 },
      movementType: 'return-to-store',
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
    ).rejects.toMatchObject({ code: 'inventory.periodic_movement' });

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
      // A receipt without its Purchase Order line is a stock fact with nothing to attach to.
      {
        delta: 1,
        movementType: 'receipt' as const,
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

describe('postReceipt', () => {
  test('posts a receipt at the line price and feeds it into stock on hand and the moving average', async ({
    context,
  }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 10, unitPrice: 25 },
    ]);
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 15 }),
    });

    const result = await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: null, partId: context.parts.piece.id, purchaseOrderId, quantity: 10, unitCost: null },
    });
    const stockOnHand = await listStockOnHand({ db: context.db });
    const piece = stockOnHand.items.find((row) => row.partId === context.parts.piece.id);

    expect(result).toMatchObject({
      movement: { delta: 10, jobId: null, movementType: 'receipt', purchaseOrderId, reason: null, unitCost: 25 },
      warnings: [],
    });
    expect(piece?.quantity).toBe(20);
    // Ten pieces at 15 met ten at 25.
    expect(piece?.averageUnitCost).toBeCloseTo(20, 10);
  });

  test('warns and still posts when a delivery takes the line past what was ordered', async ({ context }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 4, unitPrice: 25 },
    ]);

    await expect(
      postReceipt({
        actorUserId,
        db: context.db,
        input: { lengthMm: null, partId: context.parts.piece.id, purchaseOrderId, quantity: 3, unitCost: null },
      }),
    ).resolves.toMatchObject({ warnings: [] });

    await expect(
      postReceipt({
        actorUserId,
        db: context.db,
        input: { lengthMm: null, partId: context.parts.piece.id, purchaseOrderId, quantity: 2, unitCost: null },
      }),
    ).resolves.toMatchObject({ movement: { delta: 2 }, warnings: ['exceeds-ordered'] });
  });

  test('defaults a linear receipt to the standard purchase length and takes an explicit one otherwise', async ({
    context,
  }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.linear.id, quantity: 5, unitPrice: 600 },
    ]);

    const defaulted = await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: null, partId: context.parts.linear.id, purchaseOrderId, quantity: 2, unitCost: null },
    });
    const shortDelivery = await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: 3_000, partId: context.parts.linear.id, purchaseOrderId, quantity: 1, unitCost: null },
    });

    expect(defaulted.movement).toMatchObject({ lengthMm: 6_000, unitCost: 600 });
    expect(shortDelivery.movement).toMatchObject({ lengthMm: 3_000, unitCost: 600 });
  });

  test('takes a desk-side cost correction in place of the line price', async ({ context }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 4, unitPrice: 25 },
    ]);

    const result = await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: null, partId: context.parts.piece.id, purchaseOrderId, quantity: 1, unitCost: 31.5 },
    });

    expect(result.movement.unitCost).toBe(31.5);
  });

  test('receipts an internally fabricated Part at zero, whatever its line was priced at', async ({ context }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.fabricated.id, quantity: 2, unitPrice: 480 },
    ]);

    const result = await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: null, partId: context.parts.fabricated.id, purchaseOrderId, quantity: 2, unitCost: null },
    });

    expect(result.movement.unitCost).toBe(0);
  });

  test('receipts periodic raw material, which consumption movements are barred from', async ({ context }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.periodic.id, quantity: 3, unitPrice: 420 },
    ]);

    const result = await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: null, partId: context.parts.periodic.id, purchaseOrderId, quantity: 3, unitCost: null },
    });

    expect(result.movement).toMatchObject({ delta: 3, lengthMm: 6_000, unitCost: 420 });
  });

  test('receives only against an open line of a sent order', async ({ context }) => {
    const draftId = await seedSentPurchaseOrder(
      context.db,
      context.supplierId,
      [{ partId: context.parts.piece.id, quantity: 4, unitPrice: 25 }],
      'draft',
    );
    const sentId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 4, unitPrice: 25 },
    ]);

    await expect(
      postReceipt({
        actorUserId,
        db: context.db,
        input: {
          lengthMm: null,
          partId: context.parts.piece.id,
          purchaseOrderId: draftId,
          quantity: 1,
          unitCost: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.not_sent' });

    await expect(
      postReceipt({
        actorUserId,
        db: context.db,
        input: {
          lengthMm: null,
          partId: context.parts.measured.id,
          purchaseOrderId: sentId,
          quantity: 1,
          unitCost: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.line_not_found' });
  });

  test('holds receipts to the Part unit class', async ({ context }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 10, unitPrice: 25 },
      { partId: context.parts.measured.id, quantity: 10, unitPrice: 25 },
    ]);

    await expect(
      postReceipt({
        actorUserId,
        db: context.db,
        input: { lengthMm: null, partId: context.parts.piece.id, purchaseOrderId, quantity: 1.5, unitCost: null },
      }),
    ).rejects.toMatchObject({ code: 'inventory.invalid_delta' });

    await expect(
      postReceipt({
        actorUserId,
        db: context.db,
        input: { lengthMm: 6_000, partId: context.parts.measured.id, purchaseOrderId, quantity: 1, unitCost: null },
      }),
    ).rejects.toMatchObject({ code: 'inventory.invalid_length' });
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
    const rowFor = (partId: string) => result.items.find((row) => row.partId === partId);
    const linear = rowFor(context.parts.linear.id);

    expect(rowFor(context.parts.piece.id)).toMatchObject({
      averageUnitCost: 20,
      buckets: [{ lengthMm: null, quantity: 8, totalValue: 160 }],
      quantity: 8,
      totalValue: 160,
    });
    expect(rowFor(context.parts.measured.id)).toMatchObject({
      averageUnitCost: null,
      buckets: [{ lengthMm: null, quantity: 0, totalValue: null }],
      quantity: 0,
      totalValue: null,
    });
    // A linear Part holds one bucket per length, valued at length x average-per-mm x count.
    expect(linear).toMatchObject({ averageUnitCost: expect.closeTo(0.104, 10), free: 3, quantity: 3 });
    expect(linear?.buckets.map((bucket) => [bucket.lengthMm, bucket.quantity])).toEqual([
      [3_000, 1],
      [6_000, 2],
    ]);
    expect(linear?.buckets[0]?.totalValue).toBeCloseTo(312, 10);
    expect(linear?.buckets[1]?.totalValue).toBeCloseTo(1_248, 10);
    expect(linear?.totalValue).toBeCloseTo(1_560, 10);
    expect(rowFor(context.parts.periodic.id)).toMatchObject({
      asOfLastCount: count.createdAt,
      buckets: [{ lengthMm: 6_000, quantity: 4, totalValue: 2_400 }],
      quantity: 4,
      stockTrackingMode: 'periodic',
      totalValue: 2_400,
    });
    expect(rowFor(context.parts.fabricated.id)).toMatchObject({
      averageUnitCost: 0,
      quantity: 0,
      totalValue: 0,
    });
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
    const linear = result.items.find((row) => row.partId === context.parts.linear.id);
    const periodic = result.items.find((row) => row.partId === context.parts.periodic.id);

    expect(linear?.buckets.map((bucket) => bucket.lengthMm)).toEqual([6_000]);
    expect(periodic?.buckets.map((bucket) => bucket.lengthMm)).toEqual([3_000, 6_000]);
    expect(periodic?.asOfLastCount).toEqual(count.createdAt);
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

async function seedSentPurchaseOrder(
  db: Db,
  supplierId: string,
  lines: ReadonlyArray<{ partId: string; quantity: number; unitPrice: number }>,
  status: 'draft' | 'sent' = 'sent',
): Promise<string> {
  const [purchaseOrder] = await db
    .insert(purchaseOrders)
    .values({ sentAt: status === 'sent' ? new Date('2026-08-02T08:00:00.000Z') : null, status, supplierId })
    .returning({ id: purchaseOrders.id });
  if (!purchaseOrder) throw new Error('Purchase Order insert did not return a row');

  await db.insert(purchaseOrderLines).values(lines.map((line) => ({ ...line, purchaseOrderId: purchaseOrder.id })));

  return purchaseOrder.id;
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
