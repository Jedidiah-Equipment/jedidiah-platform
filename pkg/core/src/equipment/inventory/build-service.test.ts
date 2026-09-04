import { eq } from '@pkg/db';
import { stockMovements } from '@pkg/db/equipment';
import { describe, expect } from 'vitest';
import { PartNotBuiltError } from '../parts/part-bom-errors.js';
import { actorUserId, opening, test } from '../test/build-fixtures.js';
import { BuildPeriodicPartError, BuildSelfComponentError } from './build-errors.js';
import { postBuild } from './build-service.js';
import { FabricatedPartCostError } from './stock-movement-errors.js';
import { getStockMovementHistory, listStockOnHand, postAdjustment, postRevaluation } from './stock-movement-service.js';

describe('postBuild', () => {
  test('is value preserving: what the consume rows take out, the produce row puts back', async ({ context }) => {
    const result = await postBuild({
      actorUserId,
      db: context.db,
      input: {
        builtPartId: context.parts.assembly.id,
        consumption: [
          { componentPartId: context.parts.bolt.id, lengthMm: null, quantity: 12 },
          { componentPartId: context.parts.cylinder.id, lengthMm: null, quantity: 3 },
        ],
        quantity: 3,
      },
    });

    // 12 x 2.50 + 3 x 100 = 330 consumed, over 3 units built.
    expect(result.producedUnitCost).toBe(110);
    expect(result.warnings).toEqual([]);

    const movements = await context.db.select().from(stockMovements).where(eq(stockMovements.buildId, result.build.id));
    const consumedValue = movements
      .filter((row) => row.movementType === 'build-consume')
      .reduce((total, row) => total + row.delta * (row.unitCost ?? 0), 0);
    const producedValue = movements
      .filter((row) => row.movementType === 'build-produce')
      .reduce((total, row) => total + row.delta * (row.unitCost ?? 0), 0);

    expect(consumedValue + producedValue).toBeCloseTo(0, 6);
    expect(movements.every((row) => row.buildId === result.build.id)).toBe(true);
  });

  test('values a linear component once, at its piece cost rather than per millimetre', async ({ context }) => {
    const result = await postBuild({
      actorUserId,
      db: context.db,
      input: {
        builtPartId: context.parts.assembly.id,
        consumption: [{ componentPartId: context.parts.channel.id, lengthMm: 6_000, quantity: 2 }],
        quantity: 2,
      },
    });

    // Two 6 m pieces at R60 each is R120 consumed, over 2 units built — not R720 000.
    expect(result.producedUnitCost).toBe(60);

    const movements = await context.db.select().from(stockMovements).where(eq(stockMovements.buildId, result.build.id));
    const value = movements.reduce((total, row) => total + row.delta * (row.unitCost ?? 0), 0);
    expect(value).toBeCloseTo(0, 6);
  });

  test('posts nothing for a raw-material component, whose BOM line is informational', async ({ context }) => {
    const result = await postBuild({
      actorUserId,
      db: context.db,
      input: {
        builtPartId: context.parts.assembly.id,
        consumption: [
          { componentPartId: context.parts.bolt.id, lengthMm: null, quantity: 4 },
          { componentPartId: context.parts.plate.id, lengthMm: 6_000, quantity: 2 },
        ],
        quantity: 1,
      },
    });

    const plateMovements = await context.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.partId, context.parts.plate.id));

    expect(plateMovements).toEqual([]);
    // Only the bolts carried value, so the produced cost is theirs alone.
    expect(result.producedUnitCost).toBe(10);
  });

  test('warns without blocking when the rack gave something other than the BOM, or gave too little', async ({
    context,
  }) => {
    const result = await postBuild({
      actorUserId,
      db: context.db,
      input: {
        builtPartId: context.parts.assembly.id,
        consumption: [
          { componentPartId: context.parts.bolt.id, lengthMm: null, quantity: 5 },
          { componentPartId: context.parts.cylinder.id, lengthMm: null, quantity: 40 },
        ],
        quantity: 1,
      },
    });

    expect(result.warnings).toEqual([
      { codes: ['bom-deviation'], componentPartId: context.parts.bolt.id },
      { codes: ['bom-deviation', 'negative-stock-on-hand'], componentPartId: context.parts.cylinder.id },
    ]);

    const onHand = await listStockOnHand({ db: context.db });
    expect(onHand.items.find((row) => row.partId === context.parts.cylinder.id)?.quantity).toBe(-30);
  });

  test('flags a BOM component left off the list entirely', async ({ context }) => {
    const result = await postBuild({
      actorUserId,
      db: context.db,
      input: {
        builtPartId: context.parts.assembly.id,
        consumption: [{ componentPartId: context.parts.bolt.id, lengthMm: null, quantity: 4 }],
        quantity: 1,
      },
    });

    // The cylinder never reached the loop, but consuming none of it still deviates from the BOM.
    // The plate does not: raw material posts nothing, so leaving it off is what the spec expects.
    expect(result.warnings).toEqual([{ codes: ['bom-deviation'], componentPartId: context.parts.cylinder.id }]);
  });

  test('reads a trivial build as having no cost yet rather than as free', async ({ context }) => {
    const result = await postBuild({
      actorUserId,
      db: context.db,
      input: { builtPartId: context.parts.assembly.id, consumption: [], quantity: 2 },
    });

    expect(result.producedUnitCost).toBeNull();

    const history = await getStockMovementHistory({ db: context.db, partId: context.parts.assembly.id });
    expect(history.items[0]).toMatchObject({ delta: 2, movementType: 'build-produce', unitCost: null });
  });

  test('carries the built value onto a Job when the Built Part is drawn', async ({ context }) => {
    await postBuild({
      actorUserId,
      db: context.db,
      input: {
        builtPartId: context.parts.assembly.id,
        consumption: [
          { componentPartId: context.parts.bolt.id, lengthMm: null, quantity: 4 },
          { componentPartId: context.parts.cylinder.id, lengthMm: null, quantity: 1 },
        ],
        quantity: 1,
      },
    });

    const onHand = await listStockOnHand({ db: context.db });

    // The build moved 110 of component value onto the assembly; a draw must carry it, not drop it.
    expect(onHand.items.find((row) => row.partId === context.parts.assembly.id)?.averageUnitCost).toBe(110);
  });

  test('refuses a Part that is bought, a Part that is counted, and a Part consuming itself', async ({ context }) => {
    await expect(
      postBuild({
        actorUserId,
        db: context.db,
        input: { builtPartId: context.parts.bolt.id, consumption: [], quantity: 1 },
      }),
    ).rejects.toBeInstanceOf(PartNotBuiltError);

    await expect(
      postBuild({
        actorUserId,
        db: context.db,
        input: { builtPartId: context.parts.periodicBuilt.id, consumption: [], quantity: 1 },
      }),
    ).rejects.toBeInstanceOf(BuildPeriodicPartError);

    await expect(
      postBuild({
        actorUserId,
        db: context.db,
        input: {
          builtPartId: context.parts.assembly.id,
          consumption: [{ componentPartId: context.parts.assembly.id, lengthMm: null, quantity: 1 }],
          quantity: 1,
        },
      }),
    ).rejects.toBeInstanceOf(BuildSelfComponentError);
  });

  test('costs a Built Part by its build and refuses the same figure keyed by hand', async ({ context }) => {
    // The two halves of one invariant, pinned together so neither can be "fixed" on its own: a build
    // may stamp the cost it derived, and no hand-entered figure may reach the same Part.
    await postBuild({
      actorUserId,
      db: context.db,
      input: {
        builtPartId: context.parts.assembly.id,
        consumption: [{ componentPartId: context.parts.bolt.id, lengthMm: null, quantity: 4 }],
        quantity: 1,
      },
    });

    const stockOnHand = await listStockOnHand({ db: context.db });
    expect(stockOnHand.items.find((row) => row.partId === context.parts.assembly.id)?.averageUnitCost).toBe(10);

    await expect(
      postAdjustment({
        actorUserId,
        db: context.db,
        input: opening(context.parts.assembly.id, { delta: 1, unitCost: 10 }),
      }),
    ).rejects.toBeInstanceOf(FabricatedPartCostError);

    await expect(
      postRevaluation({
        actorUserId,
        db: context.db,
        input: { note: null, partId: context.parts.assembly.id, unitCost: 10 },
      }),
    ).rejects.toBeInstanceOf(FabricatedPartCostError);
  });
});
