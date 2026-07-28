import { auditEvents, type Db, products, productUnits, user } from '@pkg/db';
import { asc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { updateProductUnit } from './product-unit-service.js';

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000e1';
const MISSING_UNIT_ID = '00000000-0000-4000-8000-0000000000ef';

const test = createTester(async ({ db }) => ({ db, seed: await seedUnit(db) }));

async function readAuditEvents(db: Db) {
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.entityType, 'product_unit'))
    .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));
}

describe('updateProductUnit', () => {
  test('captures a VIN against the machine', async ({ context }) => {
    const result = await updateProductUnit({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: { id: context.seed.unitId, vinNumber: 'VIN-EDITED-1' },
    });

    expect(result.unit).toMatchObject({ productSerialNumber: 'VIN-001260001', vinNumber: 'VIN-EDITED-1' });

    const [row] = await context.db.select().from(productUnits);
    expect(row?.vinNumber).toBe('VIN-EDITED-1');
  });

  test('clears a VIN captured in error', async ({ context }) => {
    await updateProductUnit({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: { id: context.seed.unitId, vinNumber: 'VIN-EDITED-1' },
    });

    const result = await updateProductUnit({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: { id: context.seed.unitId, vinNumber: null },
    });

    expect(result.unit.vinNumber).toBeNull();
  });

  // A VIN identifies the machine for the rest of its life, so who changed it and to what is the point
  // of putting Units in the audit log at all.
  test('records who changed the VIN and what it was before', async ({ context }) => {
    await updateProductUnit({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: { id: context.seed.unitId, vinNumber: 'VIN-EDITED-1' },
    });

    const events = await readAuditEvents(context.db);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'updated',
      actorUserId: ACTOR_USER_ID,
      changes: { vinNumber: { from: null, to: 'VIN-EDITED-1' } },
      entityId: context.seed.unitId,
    });
  });

  test('writes nothing when the VIN is resubmitted unchanged', async ({ context }) => {
    const input = { id: context.seed.unitId, vinNumber: 'VIN-EDITED-1' };
    await updateProductUnit({ actorUserId: ACTOR_USER_ID, db: context.db, input });

    await updateProductUnit({ actorUserId: ACTOR_USER_ID, db: context.db, input });

    expect(await readAuditEvents(context.db)).toHaveLength(1);
  });

  test('reports a machine that does not exist as not found', async ({ context }) => {
    await expect(
      updateProductUnit({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: { id: MISSING_UNIT_ID, vinNumber: 'VIN-EDITED-1' },
      }),
    ).rejects.toMatchObject({ code: 'product_unit.not_found' });
  });
});

async function seedUnit(db: Db) {
  const now = new Date('2026-05-01T08:00:00.000Z');

  await db.insert(user).values({
    createdAt: now,
    email: 'unit-service@example.com',
    emailVerified: true,
    id: ACTOR_USER_ID,
    name: 'Unit Service Test User',
    role: 'admin',
    updatedAt: now,
  });

  const rangeId = await createProductRangeFixture(db);
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      description: null,
      modelCode: 'VIN-001',
      name: 'Unit Service Test Product',
      rangeId,
    })
    .returning();
  if (!product) throw new Error('Product insert did not return a row');

  const [unit] = await db
    .insert(productUnits)
    .values({
      productId: product.id,
      productSerialNumber: 'VIN-001260001',
      productSerialPrefix: 'VIN-001',
      productSerialSequence: 1,
      productSerialYear: 26,
    })
    .returning();
  if (!unit) throw new Error('Product unit insert did not return a row');

  return { unitId: unit.id };
}
