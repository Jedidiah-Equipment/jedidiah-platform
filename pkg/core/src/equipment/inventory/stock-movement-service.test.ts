import { user } from '@pkg/db';
import {
  jobCfoAssemblies,
  jobCfoParts,
  jobEstimateSnapshots,
  jobStockCloseOuts,
  jobs,
  parts,
  stockMovements,
} from '@pkg/db/equipment';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import {
  actorUserId,
  adjustmentInput,
  estimateSnapshot,
  seedProductUnit,
  seedQuickSwitchPerson,
  seedSentPurchaseOrder,
  test,
} from '../test/inventory-fixtures.js';
import { partValues } from '../test/part-fixtures.js';
import { postReceipt } from './receipt-service.js';
import {
  getStockMovementHistory,
  listJobStock,
  listStockOnHand,
  postAdjustment,
  postCheckout,
  postCheckoutBasket,
  postJobMovement,
  postReturnToStore,
  postRevaluation,
} from './stock-movement-service.js';

describe('Checkout Basket', () => {
  test('posts a Job Basket as ordinary Checkout rows with shared target and actor', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.measured.id, { delta: 10, unitCost: 20 }),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 5, lengthMm: 6_000, unitCost: 600 }),
    });
    const assertedActorUserId = await seedQuickSwitchPerson(context.db, { id: 'basket-operator' });

    const result = await postCheckoutBasket({
      actorUserId,
      db: context.db,
      input: {
        actorUserId: assertedActorUserId,
        jobId: context.jobs.custom.id,
        lines: [
          { lengthMm: null, partId: context.parts.piece.id, quantity: 2 },
          { lengthMm: null, partId: context.parts.measured.id, quantity: 1.5 },
          { lengthMm: 6_000, partId: context.parts.linear.id, quantity: 1 },
        ],
      },
    });
    const stock = await listStockOnHand({ db: context.db });

    expect(result.lines).toHaveLength(3);
    expect(result.lines.map(({ movement }) => movement)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: assertedActorUserId,
          delta: -2,
          jobId: context.jobs.custom.id,
          partId: context.parts.piece.id,
          unitCost: 10,
        }),
        expect.objectContaining({
          actorUserId: assertedActorUserId,
          delta: -1.5,
          jobId: context.jobs.custom.id,
          partId: context.parts.measured.id,
          unitCost: 20,
        }),
        expect.objectContaining({
          actorUserId: assertedActorUserId,
          delta: -1,
          jobId: context.jobs.custom.id,
          partId: context.parts.linear.id,
          unitCost: 600,
        }),
      ]),
    );
    expect(stock.items.find((row) => row.partId === context.parts.piece.id)?.quantity).toBe(8);
    expect(stock.items.find((row) => row.partId === context.parts.measured.id)?.quantity).toBe(8.5);
    expect(stock.items.find((row) => row.partId === context.parts.linear.id)?.quantity).toBe(4);
  });

  test('writes a Without-a-Job Basket target onto every ordinary Checkout row', async ({ context }) => {
    const recipientUserId = await seedQuickSwitchPerson(context.db, { id: 'basket-recipient' });

    const result = await postCheckoutBasket({
      actorUserId,
      db: context.db,
      input: {
        lines: [
          { lengthMm: null, partId: context.parts.piece.id, quantity: 2 },
          { lengthMm: null, partId: context.parts.measured.id, quantity: 1.5 },
        ],
        note: 'repair the factory press',
        recipientUserId,
      },
    });

    expect(result.lines.map(({ movement }) => movement)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: null,
          note: 'repair the factory press',
          recipientUserId,
          sourceCheckoutId: null,
        }),
        expect.objectContaining({
          jobId: null,
          note: 'repair the factory press',
          recipientUserId,
          sourceCheckoutId: null,
        }),
      ]),
    );
  });

  test('rolls every line back when a later Part refuses Checkout', async ({ context }) => {
    const before = await context.db.select().from(stockMovements);

    await expect(
      postCheckoutBasket({
        actorUserId,
        db: context.db,
        input: {
          jobId: context.jobs.custom.id,
          lines: [
            { lengthMm: null, partId: context.parts.piece.id, quantity: 1 },
            { lengthMm: null, partId: context.parts.measured.id, quantity: 1 },
            { lengthMm: 6_000, partId: context.parts.periodic.id, quantity: 1 },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: 'inventory.periodic_movement' });

    expect(await context.db.select().from(stockMovements)).toHaveLength(before.length);
  });

  test('rejects a closed-out Job or ineligible Recipient without posting any line', async ({ context }) => {
    await context.db.insert(jobStockCloseOuts).values({ actorUserId, jobId: context.jobs.custom.id, note: null });
    const before = await context.db.select().from(stockMovements);

    await expect(
      postCheckoutBasket({
        actorUserId,
        db: context.db,
        input: {
          jobId: context.jobs.custom.id,
          lines: [{ lengthMm: null, partId: context.parts.piece.id, quantity: 1 }],
        },
      }),
    ).rejects.toMatchObject({ code: 'inventory.job_closed_out' });
    await expect(
      postCheckoutBasket({
        actorUserId,
        db: context.db,
        input: {
          lines: [{ lengthMm: null, partId: context.parts.piece.id, quantity: 1 }],
          note: 'repair',
          recipientUserId: 'missing-recipient',
        },
      }),
    ).rejects.toMatchObject({ code: 'inventory.recipient_ineligible' });
    expect(await context.db.select().from(stockMovements)).toHaveLength(before.length);
  });

  test('judges same-Part length lines sequentially and flattens duplicate warnings', async ({ context }) => {
    const [assembly] = await context.db
      .select({ id: jobCfoAssemblies.id })
      .from(jobCfoAssemblies)
      .where(eq(jobCfoAssemblies.jobId, context.jobs.cfo.id))
      .limit(1);
    if (!assembly) throw new Error('CFO assembly fixture missing');
    await context.db.insert(jobCfoParts).values({
      cfoAssemblyId: assembly.id,
      partId: context.parts.linear.id,
      quantity: 5,
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 10, lengthMm: 6_000, unitCost: 600 }),
    });

    const result = await postCheckoutBasket({
      actorUserId,
      db: context.db,
      input: {
        jobId: context.jobs.cfo.id,
        lines: [
          { lengthMm: 6_000, partId: context.parts.linear.id, quantity: 3 },
          { lengthMm: 3_000, partId: context.parts.linear.id, quantity: 3 },
        ],
      },
    });

    expect(result.lines.map((line) => line.warnings)).toEqual([[], ['exceeds-cfo', 'negative-stock-on-hand']]);
    expect(result.warnings).toEqual(['exceeds-cfo', 'negative-stock-on-hand']);
  });
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

  test('posts an off-CFO checkout for a Custom Job, flagging the short rack but not a CFO it never had', async ({
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
      warnings: ['negative-stock-on-hand'],
    });
  });

  test('warns once a Job that did plan the Part is drawn past its CFO', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    const movement = {
      jobId: context.jobs.cfo.id,
      lengthMm: null,
      partId: context.parts.piece.id,
    };

    // The fixture's CFO demands 5 of this Part, and stock covers every draw here.
    await expect(
      postJobMovement({ actorUserId, db: context.db, input: { ...movement, quantity: 5 }, movementType: 'checkout' }),
    ).resolves.toMatchObject({ warnings: [] });
    await expect(
      postJobMovement({ actorUserId, db: context.db, input: { ...movement, quantity: 1 }, movementType: 'checkout' }),
    ).resolves.toMatchObject({ warnings: ['exceeds-cfo'] });
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

describe('Checkout without a Job', () => {
  test('attributes a purpose Checkout to its recipient and prices linked partial returns from that source', async ({
    context,
  }) => {
    const now = new Date('2026-08-01T08:00:00.000Z');
    await context.db.insert(user).values({
      createdAt: now,
      email: 'connor@example.com',
      emailVerified: true,
      id: 'connor',
      name: 'Connor Mechanic',
      role: 'bay-operator',
      updatedAt: now,
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });

    const checkout = await postCheckout({
      actorUserId,
      db: context.db,
      input: {
        lengthMm: null,
        note: 'repair factory drill',
        partId: context.parts.piece.id,
        quantity: 5,
        recipientUserId: 'connor',
      },
    });
    await postRevaluation({
      actorUserId,
      db: context.db,
      input: { note: 'Later receipt changed average', partId: context.parts.piece.id, unitCost: 20 },
    });
    const returnOperatorUserId = await seedQuickSwitchPerson(context.db, { id: 'return-operator' });
    await context.db.update(user).set({ banned: true }).where(eq(user.id, 'connor'));

    const returned = await postReturnToStore({
      actorUserId,
      db: context.db,
      input: { actorUserId: returnOperatorUserId, quantity: 2, sourceCheckoutId: checkout.movement.id },
    });
    const stock = await listStockOnHand({ db: context.db });
    const history = await getStockMovementHistory({ db: context.db, partId: context.parts.piece.id });

    expect(checkout).toMatchObject({
      movement: {
        actorUserId,
        delta: -5,
        jobId: null,
        note: 'repair factory drill',
        recipientUserId: 'connor',
        sourceCheckoutId: null,
        unitCost: 10,
      },
      warnings: [],
    });
    expect(returned).toMatchObject({
      movement: {
        actorUserId: returnOperatorUserId,
        delta: 2,
        recipientUserId: 'connor',
        sourceCheckoutId: checkout.movement.id,
        unitCost: 10,
      },
      warnings: [],
    });
    expect(stock.items.find((item) => item.partId === context.parts.piece.id)?.quantity).toBe(7);
    expect(history.items.find((item) => item.id === checkout.movement.id)).toMatchObject({
      actorName: 'Inventory Tester',
      note: 'repair factory drill',
      recipientName: 'Connor Mechanic',
      sourceCheckoutId: null,
    });
    expect(history.items.find((item) => item.id === returned.movement.id)).toMatchObject({
      actorName: 'Quick Switch Person',
      recipientName: 'Connor Mechanic',
      sourceCheckoutCreatedAt: checkout.movement.createdAt,
      sourceCheckoutId: checkout.movement.id,
    });
  });

  test('rejects ineligible recipients and invalid linked-return sources', async ({ context }) => {
    const now = new Date('2026-08-01T08:00:00.000Z');
    await context.db.insert(user).values([
      {
        banned: true,
        createdAt: now,
        email: 'disabled-recipient@example.com',
        emailVerified: true,
        id: 'disabled-recipient',
        name: 'Disabled Recipient',
        role: 'stores',
        updatedAt: now,
      },
      {
        createdAt: now,
        email: 'device-recipient@example.com',
        emailVerified: true,
        id: 'device-recipient',
        isDevice: true,
        name: 'Device Recipient',
        role: 'stores',
        updatedAt: now,
      },
    ]);
    for (const recipientUserId of ['disabled-recipient', 'device-recipient']) {
      await expect(
        postCheckout({
          actorUserId,
          db: context.db,
          input: {
            lengthMm: null,
            note: 'quick repair',
            partId: context.parts.piece.id,
            quantity: 1,
            recipientUserId,
          },
        }),
      ).rejects.toMatchObject({ code: 'inventory.recipient_ineligible' });
    }

    await expect(
      postCheckout({
        actorUserId,
        db: context.db,
        input: {
          lengthMm: null,
          note: 'quick repair',
          partId: context.parts.piece.id,
          quantity: 1,
          recipientUserId: 'missing-person',
        },
      }),
    ).rejects.toMatchObject({ code: 'inventory.recipient_ineligible' });

    const jobCheckout = await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 1 },
      movementType: 'checkout',
    });
    await expect(
      postReturnToStore({
        actorUserId,
        db: context.db,
        input: { quantity: 1, sourceCheckoutId: jobCheckout.movement.id },
      }),
    ).rejects.toMatchObject({ code: 'inventory.invalid_source_checkout' });
  });

  test('serializes concurrent linked returns and warns only the one that exceeds the latest outstanding quantity', async ({
    context,
  }) => {
    const now = new Date('2026-08-01T08:00:00.000Z');
    await context.db.insert(user).values({
      createdAt: now,
      email: 'recipient-concurrent@example.com',
      emailVerified: true,
      id: 'recipient-concurrent',
      name: 'Concurrent Recipient',
      role: 'bay-operator',
      updatedAt: now,
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 3, unitCost: 10 }),
    });
    const checkout = await postCheckout({
      actorUserId,
      db: context.db,
      input: {
        lengthMm: null,
        note: 'concurrent repair',
        partId: context.parts.piece.id,
        quantity: 3,
        recipientUserId: 'recipient-concurrent',
      },
    });

    const returns = await Promise.all([
      postReturnToStore({
        actorUserId,
        db: context.db,
        input: { quantity: 2, sourceCheckoutId: checkout.movement.id },
      }),
      postReturnToStore({
        actorUserId,
        db: context.db,
        input: { quantity: 2, sourceCheckoutId: checkout.movement.id },
      }),
    ]);

    // Either return may take the lock first; what is fixed is that exactly one exceeds the source.
    expect(returns.map((result) => result.warnings).sort((left, right) => left.length - right.length)).toEqual([
      [],
      ['exceeds-drawn'],
    ]);
    expect(returns.map((result) => result.movement.unitCost).sort((left, right) => (left ?? 0) - (right ?? 0))).toEqual(
      [5, 10],
    );
  });

  test('keeps an uncosted source uncosted when its linked stock returns', async ({ context }) => {
    const recipientUserId = await seedQuickSwitchPerson(context.db, { id: 'uncosted-recipient' });
    const checkout = await postCheckout({
      actorUserId,
      db: context.db,
      input: {
        lengthMm: null,
        note: 'investigate test equipment',
        partId: context.parts.measured.id,
        quantity: 1,
        recipientUserId,
      },
    });

    const returned = await postReturnToStore({
      actorUserId,
      db: context.db,
      input: { quantity: 1, sourceCheckoutId: checkout.movement.id },
    });

    expect(checkout.movement.unitCost).toBeNull();
    expect(returned.movement.unitCost).toBeNull();
  });

  test('inherits a linked linear source length and its scaled piece cost', async ({ context }) => {
    const recipientUserId = await seedQuickSwitchPerson(context.db, { id: 'linear-recipient' });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 2, lengthMm: 6_000, unitCost: 600 }),
    });
    const checkout = await postCheckout({
      actorUserId,
      db: context.db,
      input: {
        lengthMm: 3_000,
        note: 'make a machine guard',
        partId: context.parts.linear.id,
        quantity: 1,
        recipientUserId,
      },
    });

    const returned = await postReturnToStore({
      actorUserId,
      db: context.db,
      input: { quantity: 1, sourceCheckoutId: checkout.movement.id },
    });

    expect(checkout.movement).toMatchObject({ lengthMm: 3_000, unitCost: 300 });
    expect(returned.movement).toMatchObject({ lengthMm: 3_000, unitCost: 300 });
  });

  test('keeps two Checkouts for one recipient as separate linked cost pools', async ({ context }) => {
    const recipientUserId = await seedQuickSwitchPerson(context.db, { id: 'two-pool-recipient' });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    const first = await postCheckout({
      actorUserId,
      db: context.db,
      input: {
        lengthMm: null,
        note: 'first repair',
        partId: context.parts.piece.id,
        quantity: 2,
        recipientUserId,
      },
    });
    await postRevaluation({
      actorUserId,
      db: context.db,
      input: { note: 'new shelf value', partId: context.parts.piece.id, unitCost: 20 },
    });
    const second = await postCheckout({
      actorUserId,
      db: context.db,
      input: {
        lengthMm: null,
        note: 'second repair',
        partId: context.parts.piece.id,
        quantity: 2,
        recipientUserId,
      },
    });

    const [firstReturn, secondReturn] = await Promise.all([
      postReturnToStore({
        actorUserId,
        db: context.db,
        input: { quantity: 1, sourceCheckoutId: first.movement.id },
      }),
      postReturnToStore({
        actorUserId,
        db: context.db,
        input: { quantity: 1, sourceCheckoutId: second.movement.id },
      }),
    ]);

    expect(firstReturn.movement).toMatchObject({ sourceCheckoutId: first.movement.id, unitCost: 10 });
    expect(secondReturn.movement).toMatchObject({ sourceCheckoutId: second.movement.id, unitCost: 20 });
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

  test('rejects linked returns whose source or inherited identity is invalid', async ({ context }) => {
    const recipientUserId = await seedQuickSwitchPerson(context.db, { id: 'constraint-recipient' });
    const otherRecipientUserId = await seedQuickSwitchPerson(context.db, { id: 'other-constraint-recipient' });
    const adjustment = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 2, unitCost: 10 }),
    });
    const checkout = await postCheckout({
      actorUserId,
      db: context.db,
      input: {
        lengthMm: null,
        note: 'repair a press guard',
        partId: context.parts.piece.id,
        quantity: 1,
        recipientUserId,
      },
    });
    const invalidReturns = [
      {
        partId: context.parts.piece.id,
        recipientUserId,
        sourceCheckoutId: adjustment.id,
      },
      {
        partId: context.parts.measured.id,
        recipientUserId,
        sourceCheckoutId: checkout.movement.id,
      },
      {
        partId: context.parts.piece.id,
        recipientUserId: otherRecipientUserId,
        sourceCheckoutId: checkout.movement.id,
      },
    ];

    for (const invalidReturn of invalidReturns) {
      await expect(
        context.db.insert(stockMovements).values({
          actorUserId,
          delta: 1,
          lengthMm: null,
          movementType: 'return-to-store',
          ...invalidReturn,
        }),
      ).rejects.toMatchObject({ cause: { constraint_name: 'stock_movement_source_checkout_identity' } });
    }
  });
});

describe('listStockOnHand', () => {
  test('derives plate estimates from live Job snapshots across counts, receipts, and cancellation', async ({
    context,
  }) => {
    const [plate] = await context.db
      .insert(parts)
      .values({
        ...partValues({
          code: 'PLATE',
          stockTrackingMode: 'periodic',
          supplierId: context.supplierId,
          unitOfMeasure: 'piece',
        }),
        averageUtilizationPercent: 85,
      })
      .returning();
    if (!plate) throw new Error('Plate insert did not return a row');

    const opening = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(plate.id, { delta: 3, unitCost: 1_000 }),
    });
    await context.db
      .update(stockMovements)
      .set({ createdAt: new Date('2026-08-01T08:00:00.000Z') })
      .where(eq(stockMovements.id, opening.id));
    const productUnit = await seedProductUnit(context.db, 'PLATE-EST');
    await context.db
      .update(jobs)
      .set({ createdAt: new Date('2026-08-02T08:00:00.000Z'), productUnitId: productUnit.id })
      .where(eq(jobs.id, context.jobs.cfo.id));
    await context.db.insert(jobEstimateSnapshots).values({
      jobId: context.jobs.cfo.id,
      payload: estimateSnapshot(plate, 0.06),
    });

    expect((await listStockOnHand({ db: context.db })).items.find((row) => row.partId === plate.id)).toMatchObject({
      estimatedOnHand: { openPlateRemainingPercent: 94, wholeUnits: 2 },
      quantity: 3,
    });

    const count = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(plate.id, { delta: -1, note: 'Weekly count', reason: 'stock-count' }),
    });
    await context.db
      .update(stockMovements)
      .set({ createdAt: new Date('2026-08-03T08:00:00.000Z') })
      .where(eq(stockMovements.id, count.id));
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: plate.id, quantity: 2, unitPrice: 1_000 },
    ]);
    const receipt = await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: null, partId: plate.id, purchaseOrderId, quantity: 2, unitCost: null },
    });
    await context.db
      .update(stockMovements)
      .set({ createdAt: new Date('2026-08-04T08:00:00.000Z') })
      .where(eq(stockMovements.id, receipt.movement.id));
    const [laterProductJob] = await context.db
      .insert(jobs)
      .values({ createdAt: new Date('2026-08-05T08:00:00.000Z'), productUnitId: productUnit.id })
      .returning();
    if (!laterProductJob) throw new Error('Product Job insert did not return a row');
    await context.db
      .insert(jobEstimateSnapshots)
      .values({ jobId: laterProductJob.id, payload: estimateSnapshot(plate, 0.8) });

    expect((await listStockOnHand({ db: context.db })).items.find((row) => row.partId === plate.id)).toMatchObject({
      estimatedOnHand: { openPlateRemainingPercent: 99, wholeUnits: 3 },
      quantity: 4,
    });

    await context.db
      .update(jobs)
      .set({ cancelledAt: new Date('2026-08-06T08:00:00.000Z') })
      .where(eq(jobs.id, laterProductJob.id));
    expect((await listStockOnHand({ db: context.db })).items.find((row) => row.partId === plate.id)).toMatchObject({
      estimatedOnHand: { openPlateRemainingPercent: 94, wholeUnits: 4 },
      quantity: 4,
    });
  });

  test('reports open sent Purchase Order quantities beside Free Stock', async ({ context }) => {
    await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 7, unitPrice: 10 },
    ]);

    const result = await listStockOnHand({ db: context.db });

    expect(result.items.find((row) => row.partId === context.parts.piece.id)).toMatchObject({
      free: -5,
      onOrder: 7,
    });
  });

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
      averageUnitCost: null,
      quantity: 0,
      totalValue: null,
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
      isInternallyFabricated: false,
      name: 'PIECE',
      stockTrackingMode: 'perpetual',
      unitOfMeasure: 'piece',
    });
    expect(result.items).toMatchObject([
      { actorName: 'Inventory Tester', movementValue: 200, runningBalance: 10, unitCost: 20 },
      { actorName: 'Inventory Tester', movementValue: -40, runningBalance: 8, unitCost: null },
      { actorName: 'Inventory Tester', movementValue: null, runningBalance: 8, unitCost: 30 },
    ]);
  });

  test('keeps stamped linear movement values and reads an uncosted built Part as having none', async ({ context }) => {
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
    expect(fabricated.items[0]?.movementValue).toBeNull();
  });
});
