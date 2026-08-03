import type { Db } from '@pkg/db';
import { parts, supplier, user } from '@pkg/db';
import { postAdjustment } from '../inventory/stock-movement-service.js';
import { savePartBom } from '../parts/part-bom-service.js';
import { createTester } from './create-tester.js';
import { partValues } from './part-fixtures.js';

/**
 * The world a Built Part lives in: an assembly with a BOM of bought components plus raw plate that
 * posts nothing, a linear component priced per millimetre, and a periodic built Part that can never
 * be produced into. Shared so the build suite and the BOM suite cannot drift apart.
 */

export const actorUserId = 'build-test-user';

export const test = createTester(async ({ db }) => {
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

export function opening(partId: string, overrides: { delta: number; unitCost: number }) {
  return {
    delta: overrides.delta,
    lengthMm: null,
    note: null,
    partId,
    reason: 'opening-balance' as const,
    unitCost: overrides.unitCost,
  };
}

export async function seedParts(db: Db, supplierId: string) {
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
