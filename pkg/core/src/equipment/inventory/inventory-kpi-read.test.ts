import { stockMovements } from '@pkg/db/equipment';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { actorUserId, adjustmentInput, test } from '../test/inventory-fixtures.js';
import { getInventoryKpis } from './inventory-kpi-read.js';
import { postAdjustment, postJobMovement, postRevaluation } from './stock-movement-service.js';

describe('getInventoryKpis', () => {
  test('returns an empty management snapshot when the ledger has no movements', async ({ context }) => {
    await expect(
      getInventoryKpis({ db: context.db, throughAt: new Date('2026-08-19T12:00:00.000Z') }),
    ).resolves.toEqual({
      adjustments: [],
      inventoryTurns: null,
      inventoryValue: 0,
      scrapItems: [],
      trailing90DayConsumptionValue: 0,
    });
  });

  test('subtracts negative stock from the current inventory valuation', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: -12, note: 'Count discrepancy', reason: 'correction' }),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.periodic.id, { delta: 2, lengthMm: 6_000, unitCost: 600 }),
    });

    await expect(
      getInventoryKpis({ db: context.db, throughAt: new Date('2026-08-19T12:00:00.000Z') }),
    ).resolves.toMatchObject({ inventoryValue: 1_180 });
  });

  test('annualizes trailing 90-day stamped consumption for perpetual stock only', async ({ context }) => {
    const opening = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 20, unitCost: 10 }),
    });
    const oldCheckout = await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 2 },
      movementType: 'checkout',
    });
    const checkout = await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 4 },
      movementType: 'checkout',
    });
    const returned = await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.piece.id, quantity: 1 },
      movementType: 'return-to-store',
    });
    const periodicOpening = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.periodic.id, { delta: 2, lengthMm: 6_000, unitCost: 600 }),
    });
    const [periodicConsumption] = await context.db
      .insert(stockMovements)
      .values({
        actorUserId,
        createdAt: new Date('2026-08-03T08:00:00.000Z'),
        delta: -1,
        jobId: context.jobs.custom.id,
        lengthMm: 6_000,
        movementType: 'checkout',
        partId: context.parts.periodic.id,
        unitCost: 600,
      })
      .returning();
    if (!periodicConsumption) throw new Error('Periodic consumption insert did not return a row');

    await Promise.all([
      setMovementTime(context.db, opening.id, '2026-04-01T08:00:00.000Z'),
      setMovementTime(context.db, oldCheckout.movement.id, '2026-05-01T08:00:00.000Z'),
      setMovementTime(context.db, checkout.movement.id, '2026-08-01T08:00:00.000Z'),
      setMovementTime(context.db, returned.movement.id, '2026-08-02T08:00:00.000Z'),
      setMovementTime(context.db, periodicOpening.id, '2026-04-01T08:00:00.000Z'),
    ]);

    const result = await getInventoryKpis({
      db: context.db,
      throughAt: new Date('2026-08-19T12:00:00.000Z'),
    });

    expect(result).toMatchObject({ inventoryTurns: 0.8, inventoryValue: 750, trailing90DayConsumptionValue: 30 });
  });

  test('ranks current-month adjustment reasons and scrap Parts at current moving averages', async ({ context }) => {
    const pieceOpening = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    const oldDamage = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: -1, note: 'July damage', reason: 'damage' }),
    });
    const damage = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: -2, note: 'Damaged', reason: 'damage' }),
    });
    const correction = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 1, note: 'Found one', reason: 'correction' }),
    });
    const revaluation = await postRevaluation({
      actorUserId,
      db: context.db,
      input: { note: 'Current replacement price', partId: context.parts.piece.id, unitCost: 12 },
    });
    const linearOpening = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 2, lengthMm: 6_000, unitCost: 600 }),
    });
    const scrap = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, {
        delta: -1,
        lengthMm: 6_000,
        note: 'Bent beyond use',
        reason: 'scrap',
      }),
    });

    await Promise.all([
      setMovementTime(context.db, pieceOpening.id, '2026-07-01T08:00:00.000Z'),
      setMovementTime(context.db, oldDamage.id, '2026-07-31T08:00:00.000Z'),
      setMovementTime(context.db, damage.id, '2026-08-05T08:00:00.000Z'),
      setMovementTime(context.db, correction.id, '2026-08-06T08:00:00.000Z'),
      setMovementTime(context.db, revaluation.id, '2026-08-07T08:00:00.000Z'),
      setMovementTime(context.db, linearOpening.id, '2026-07-01T08:00:00.000Z'),
      setMovementTime(context.db, scrap.id, '2026-08-08T08:00:00.000Z'),
    ]);

    const result = await getInventoryKpis({
      db: context.db,
      throughAt: new Date('2026-08-19T12:00:00.000Z'),
    });

    expect(result.adjustments).toEqual([
      { reason: 'scrap', value: 600 },
      { reason: 'damage', value: 24 },
      { reason: 'correction', value: 12 },
    ]);
    expect(result.scrapItems).toEqual([
      expect.objectContaining({ partCode: 'LINEAR', partId: context.parts.linear.id, value: 600 }),
    ]);
  });

  test('keeps a grouped adjustment value incomplete when any matching row has no cost', async ({ context }) => {
    const uncostedDamage = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, {
        delta: -1,
        lengthMm: 6_000,
        note: 'Unknown-cost damage',
        reason: 'damage',
      }),
    });
    const costedOpening = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    const costedDamage = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: -2, note: 'Known-cost damage', reason: 'damage' }),
    });

    await Promise.all([
      setMovementTime(context.db, uncostedDamage.id, '2026-08-01T08:00:00.000Z'),
      setMovementTime(context.db, costedOpening.id, '2026-07-01T08:00:00.000Z'),
      setMovementTime(context.db, costedDamage.id, '2026-08-02T08:00:00.000Z'),
    ]);

    await expect(
      getInventoryKpis({ db: context.db, throughAt: new Date('2026-08-19T12:00:00.000Z') }),
    ).resolves.toMatchObject({ adjustments: [{ reason: 'damage', value: null }] });
  });

  test('starts the current month at Johannesburg midnight', async ({ context }) => {
    const opening = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    const beforeMonth = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: -1, note: 'Before midnight', reason: 'correction' }),
    });
    const inMonth = await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: -2, note: 'After midnight', reason: 'damage' }),
    });

    await Promise.all([
      setMovementTime(context.db, opening.id, '2026-07-01T08:00:00.000Z'),
      // Johannesburg is UTC+2: these straddle local midnight while both still fall on July 31 UTC.
      setMovementTime(context.db, beforeMonth.id, '2026-07-31T21:30:00.000Z'),
      setMovementTime(context.db, inMonth.id, '2026-07-31T22:30:00.000Z'),
    ]);

    await expect(
      getInventoryKpis({ db: context.db, throughAt: new Date('2026-08-01T00:30:00.000Z') }),
    ).resolves.toMatchObject({ adjustments: [{ reason: 'damage', value: 20 }] });
  });
});

async function setMovementTime(db: Parameters<typeof postAdjustment>[0]['db'], id: string, createdAt: string) {
  await db
    .update(stockMovements)
    .set({ createdAt: new Date(createdAt) })
    .where(eq(stockMovements.id, id));
}
