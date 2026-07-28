import { auditEvents, customers, type Db, jobs, products, productUnits, user } from '@pkg/db';
import { JobListInput, ProductUnitTransferInput } from '@pkg/schema';
import { asc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { listJobs } from '../jobs/job-read-service.js';
import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { transferProductUnitOwnership, updateProductUnit } from './product-unit-service.js';

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000e1';
const MISSING_UNIT_ID = '00000000-0000-4000-8000-0000000000ef';
const MISSING_CUSTOMER_ID = '00000000-0000-4000-8000-0000000000ee';

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

/** Every hand-recorded transfer moves the one seeded machine; only the destination and date vary. */
async function transfer(
  context: { db: Db; seed: { unitId: string } },
  input: { note?: string; occurredOn: string; toCustomerId: string | null },
) {
  return transferProductUnitOwnership({
    actorUserId: ACTOR_USER_ID,
    db: context.db,
    input: ProductUnitTransferInput.parse({ id: context.seed.unitId, ...input }),
  });
}

describe('transferProductUnitOwnership', () => {
  test('records a machine sold on from one customer to another', async ({ context }) => {
    await transfer(context, { occurredOn: '2026-06-01', toCustomerId: context.seed.riversideId });

    const result = await transfer(context, {
      occurredOn: '2026-07-01',
      toCustomerId: context.seed.hilltopId,
    });

    expect(result.unit.owner).toMatchObject({ companyName: 'Hilltop Transport' });
    expect(result.unit.ownershipHistory.map((entry) => entry.toCustomer?.companyName)).toEqual([
      'Riverside Farm',
      'Hilltop Transport',
    ]);
  });

  test('hands a machine back to stock, ready to be sold again', async ({ context }) => {
    await transfer(context, { occurredOn: '2026-06-01', toCustomerId: context.seed.riversideId });

    const returned = await transfer(context, { occurredOn: '2026-07-01', toCustomerId: null });

    expect(returned.unit.owner).toBeNull();

    const resold = await transfer(context, {
      occurredOn: '2026-07-02',
      toCustomerId: context.seed.hilltopId,
    });

    expect(resold.unit.owner).toMatchObject({ companyName: 'Hilltop Transport' });
  });

  // Nothing about someone else's sale is business we did, so none of it may look like one.
  test('records who entered it and when, with no quote behind it', async ({ context }) => {
    const result = await transfer(context, {
      note: 'Told to us by the buyer',
      occurredOn: '2026-06-01',
      toCustomerId: context.seed.riversideId,
    });

    expect(result.unit.ownershipHistory).toEqual([
      expect.objectContaining({
        actor: { id: ACTOR_USER_ID, name: 'Unit Service Test User' },
        fromCustomer: null,
        note: 'Told to us by the buyer',
        occurredOn: '2026-06-01',
        sourceQuote: null,
        toCustomer: expect.objectContaining({ companyName: 'Riverside Farm' }),
      }),
    ]);
  });

  // The origin is never typed: it is whoever held the machine when the row was written.
  test('reads the origin off the machine rather than the caller', async ({ context }) => {
    await transfer(context, { occurredOn: '2026-06-01', toCustomerId: context.seed.riversideId });

    const result = await transfer(context, {
      occurredOn: '2026-07-01',
      toCustomerId: context.seed.hilltopId,
    });

    expect(result.unit.ownershipHistory.at(-1)?.fromCustomer).toMatchObject({ companyName: 'Riverside Farm' });
  });

  test('shows the new owner on every Job bound to the machine', async ({ context }) => {
    await transfer(context, { occurredOn: '2026-06-01', toCustomerId: context.seed.riversideId });

    const result = await listJobs({ db: context.db, input: JobListInput.parse({ pageSize: 50 }) });

    expect(result.items.map((job) => job.customerCompanyName)).toEqual(['Riverside Farm']);
  });

  test('refuses a transfer that leaves the machine where it already is', async ({ context }) => {
    await transfer(context, { occurredOn: '2026-06-01', toCustomerId: context.seed.riversideId });

    await expect(
      transfer(context, { occurredOn: '2026-07-01', toCustomerId: context.seed.riversideId }),
    ).rejects.toMatchObject({ code: 'product_unit.owner_unchanged' });
  });

  test('refuses a return to stock for a machine we already hold', async ({ context }) => {
    await expect(transfer(context, { occurredOn: '2026-07-01', toCustomerId: null })).rejects.toMatchObject({
      code: 'product_unit.owner_unchanged',
    });
  });

  test('refuses a transfer that has not happened yet', async ({ context }) => {
    await expect(
      transfer(context, { occurredOn: '2999-01-01', toCustomerId: context.seed.riversideId }),
    ).rejects.toMatchObject({ code: 'product_unit.transfer_in_future' });
  });

  // Ownership resolves from the newest row, so a move dated before the last one would claim an origin
  // the machine had already left.
  test("refuses a transfer dated before the machine's last known move", async ({ context }) => {
    await transfer(context, { occurredOn: '2026-06-01', toCustomerId: context.seed.riversideId });

    await expect(
      transfer(context, { occurredOn: '2026-05-31', toCustomerId: context.seed.hilltopId }),
    ).rejects.toMatchObject({ code: 'product_unit.transfer_backdated' });
  });

  test('accepts a second move on the day of the last one', async ({ context }) => {
    await transfer(context, { occurredOn: '2026-06-01', toCustomerId: context.seed.riversideId });

    const result = await transfer(context, {
      occurredOn: '2026-06-01',
      toCustomerId: context.seed.hilltopId,
    });

    expect(result.unit.owner).toMatchObject({ companyName: 'Hilltop Transport' });
  });

  test('reports an unknown customer as not found', async ({ context }) => {
    await expect(
      transfer(context, { occurredOn: '2026-06-01', toCustomerId: MISSING_CUSTOMER_ID }),
    ).rejects.toMatchObject({ code: 'customer.not_found' });
  });

  test('reports a machine that does not exist as not found', async ({ context }) => {
    await expect(
      transferProductUnitOwnership({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: ProductUnitTransferInput.parse({
          id: MISSING_UNIT_ID,
          occurredOn: '2026-06-01',
          toCustomerId: context.seed.riversideId,
        }),
      }),
    ).rejects.toMatchObject({ code: 'product_unit.not_found' });
  });

  // Ownership rows are their own audit trail: actor-stamped and never edited, so they are not logged twice.
  test('writes no audit event', async ({ context }) => {
    await transfer(context, { occurredOn: '2026-06-01', toCustomerId: context.seed.riversideId });

    expect(await readAuditEvents(context.db)).toHaveLength(0);
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

  // A Stock Build: the machine exists with no Quote and nobody owning it.
  await db.insert(jobs).values({ createdAt: now, productUnitId: unit.id, updatedAt: now });

  const [riverside, hilltop] = await db
    .insert(customers)
    .values([
      { companyName: 'Riverside Farm', email: null },
      { companyName: 'Hilltop Transport', email: null },
    ])
    .returning();
  if (!riverside || !hilltop) throw new Error('Customer insert did not return a row');

  return { hilltopId: hilltop.id, riversideId: riverside.id, unitId: unit.id };
}
