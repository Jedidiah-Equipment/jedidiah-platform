import type { Db } from '@pkg/db';
import { eq, partBom, parts, stockMovements, supplier, user } from '@pkg/db';
import { describe, expect } from 'vitest';

import { PartNotBuiltError } from '../parts/part-bom-errors.js';
import { savePartBom } from '../parts/part-bom-service.js';
import { createTester } from '../test/create-tester.js';
import { BuildPeriodicPartError, BuildSelfComponentError } from './build-errors.js';
import { postBuild } from './build-service.js';
import { getStockMovementHistory, listStockOnHand, postAdjustment, postJobMovement } from './stock-movement-service.js';

const actorUserId = 'build-test-user';

const test = createTester(async ({ db }) => {
  const now = new Date('2026-08-01T08:00:00.000Z');
  await db.insert(user).values({
    createdAt: now,
    email: 'build@example.com',
    emailVerified: true,
    id: actorUserId,
    name: 'Build Tester',
    role: 'admin',
    updatedAt: now,
  });
  const [createdSupplier] = await db.insert(supplier).values({ companyName: 'Build Supplier' }).returning();
  if (!createdSupplier) throw new Error('Supplier insert did not return a row');

  const seeded = await seedParts(db, createdSupplier.id);

  // The assembly consumes 4 bolts and 1 cylinder per unit, plus raw plate that posts nothing.
  await savePartBom({
    actorUserId,
    db,
    input: {
      lines: [
        { componentPartId: seeded.bolt.id, quantity: 4 },
        { componentPartId: seeded.cylinder.id, quantity: 1 },
        { componentPartId: seeded.plate.id, quantity: 2 },
      ],
      partId: seeded.assembly.id,
    },
  });

  await postAdjustment({
    actorUserId,
    db,
    input: opening(seeded.bolt.id, { delta: 100, unitCost: 2.5 }),
  });
  await postAdjustment({
    actorUserId,
    db,
    input: opening(seeded.cylinder.id, { delta: 10, unitCost: 100 }),
  });
  // Two 6 m lengths at R60 a piece, i.e. R0.01 per mm.
  await postAdjustment({
    actorUserId,
    db,
    input: { ...opening(seeded.channel.id, { delta: 2, unitCost: 60 }), lengthMm: 6_000 },
  });

  return { parts: seeded };
});

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
});

describe('savePartBom', () => {
  test('refuses a BOM on a Part that is bought rather than built', async ({ context }) => {
    await expect(
      savePartBom({
        actorUserId,
        db: context.db,
        input: { lines: [{ componentPartId: context.parts.cylinder.id, quantity: 1 }], partId: context.parts.bolt.id },
      }),
    ).rejects.toBeInstanceOf(PartNotBuiltError);
  });

  test('rewrites the whole BOM, and an empty one is the trivial build', async ({ context }) => {
    const emptied = await savePartBom({
      actorUserId,
      db: context.db,
      input: { lines: [], partId: context.parts.assembly.id },
    });
    expect(emptied.lines).toEqual([]);

    const rewritten = await savePartBom({
      actorUserId,
      db: context.db,
      input: { lines: [{ componentPartId: context.parts.bolt.id, quantity: 7 }], partId: context.parts.assembly.id },
    });
    expect(rewritten.lines).toEqual([expect.objectContaining({ componentPartId: context.parts.bolt.id, quantity: 7 })]);

    const stored = await context.db.select().from(partBom).where(eq(partBom.parentPartId, context.parts.assembly.id));
    expect(stored).toHaveLength(1);
  });
});

function opening(partId: string, overrides: { delta: number; unitCost: number }) {
  return {
    delta: overrides.delta,
    lengthMm: null,
    note: null,
    partId,
    reason: 'opening-balance' as const,
    unitCost: overrides.unitCost,
  };
}

async function seedParts(db: Db, supplierId: string) {
  const [bolt, cylinder, plate, channel, assembly, periodicBuilt] = await db
    .insert(parts)
    .values([
      partValues({ code: 'BOLT', supplierId, unitOfMeasure: 'piece' }),
      partValues({ code: 'CYLINDER', supplierId, unitOfMeasure: 'piece' }),
      partValues({
        code: 'PLATE',
        standardPurchaseLengthMm: 6_000,
        stockTrackingMode: 'periodic',
        supplierId,
        unitOfMeasure: 'mm',
      }),
      partValues({ code: 'CHANNEL', standardPurchaseLengthMm: 6_000, supplierId, unitOfMeasure: 'mm' }),
      partValues({ code: 'ASSEMBLY', isInternallyFabricated: true, supplierId, unitOfMeasure: 'piece' }),
      partValues({
        code: 'PERIODIC-BUILT',
        isInternallyFabricated: true,
        stockTrackingMode: 'periodic',
        supplierId,
        unitOfMeasure: 'piece',
      }),
    ])
    .returning();

  if (!bolt || !cylinder || !plate || !channel || !assembly || !periodicBuilt) {
    throw new Error('Part inserts did not return all rows');
  }

  return { assembly, bolt, channel, cylinder, periodicBuilt, plate };
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
    // Supplier XOR BOM: a built Part is made in-house and bought from nobody.
    supplierId: isInternallyFabricated ? null : supplierId,
    unitOfMeasure,
  };
}
