import {
  auditEvents,
  customers,
  type Db,
  jobs,
  productSerialSequences,
  products,
  productUnitOwnershipTransfers,
  productUnits,
  quotes,
  user,
} from '@pkg/db';
import { DateOnlyIso, JobListInput, ProductUnitTransferInput } from '@pkg/schema';
import { asc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { listJobs } from '../jobs/job-read-service.js';
import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import {
  ProductUnitOwnerUnchangedError,
  ProductUnitProductNotFoundError,
  ProductUnitTransferBackdatedError,
  ProductUnitTransferInFutureError,
} from './product-unit-errors.js';
import {
  createProductUnit,
  lockUnitForOwnership,
  transferProductUnitOwnership,
  updateProductUnit,
} from './product-unit-service.js';

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000e1';
const MISSING_PRODUCT_ID = '00000000-0000-4000-8000-0000000000ed';
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

async function readUpdateAuditEvents(db: Db) {
  return (await readAuditEvents(db)).filter((event) => event.action === 'updated');
}

describe('createProductUnit', () => {
  test('reports a missing Product with a Unit-owned error before spending a serial', async ({ context }) => {
    const unitCountBefore = await context.db.$count(productUnits);
    const sequenceCountBefore = await context.db.$count(productSerialSequences);

    await expect(
      context.db.transaction((tx) =>
        createProductUnit({
          actorUserId: ACTOR_USER_ID,
          initialOwner: null,
          plantToday: DateOnlyIso.parse('2026-07-29'),
          productId: MISSING_PRODUCT_ID,
          tx,
        }),
      ),
    ).rejects.toBeInstanceOf(ProductUnitProductNotFoundError);

    await expect(context.db.$count(productUnits)).resolves.toBe(unitCountBefore);
    await expect(context.db.$count(productSerialSequences)).resolves.toBe(sequenceCountBefore);
  });

  test('mints consecutive serials per Product with independent sequences', async ({ context }) => {
    const units = await context.db.transaction(async (tx) => [
      await createProductUnit({
        actorUserId: ACTOR_USER_ID,
        initialOwner: null,
        plantToday: DateOnlyIso.parse('2026-07-29'),
        productId: context.seed.serialProductId,
        tx,
      }),
      await createProductUnit({
        actorUserId: ACTOR_USER_ID,
        initialOwner: null,
        plantToday: DateOnlyIso.parse('2026-07-29'),
        productId: context.seed.serialProductId,
        tx,
      }),
      await createProductUnit({
        actorUserId: ACTOR_USER_ID,
        initialOwner: null,
        plantToday: DateOnlyIso.parse('2026-07-29'),
        productId: context.seed.otherSerialProductId,
        tx,
      }),
    ]);

    expect(units.map((unit) => unit.productSerialNumber)).toEqual(['SER-A260001', 'SER-A260002', 'SER-B260001']);
  });

  test('creates Stock without a Transfer and an owned Unit with its initial Transfer', async ({ context }) => {
    const [stockUnit, ownedUnit] = await context.db.transaction(async (tx) => [
      await createProductUnit({
        actorUserId: ACTOR_USER_ID,
        initialOwner: null,
        plantToday: DateOnlyIso.parse('2026-07-29'),
        productId: context.seed.serialProductId,
        tx,
      }),
      await createProductUnit({
        actorUserId: ACTOR_USER_ID,
        initialOwner: {
          customerId: context.seed.riversideId,
          sourceQuoteId: context.seed.quoteId,
        },
        plantToday: DateOnlyIso.parse('2026-07-29'),
        productId: context.seed.serialProductId,
        tx,
      }),
    ]);

    const transfers = await context.db.select().from(productUnitOwnershipTransfers);
    expect(transfers).toEqual([
      expect.objectContaining({
        fromCustomerId: null,
        occurredOn: '2026-07-29',
        productUnitId: ownedUnit.id,
        sourceQuoteId: context.seed.quoteId,
        toCustomerId: context.seed.riversideId,
      }),
    ]);
    expect(transfers.some((transfer) => transfer.productUnitId === stockUnit.id)).toBe(false);

    const ownedUnitAuditEvents = (await readAuditEvents(context.db)).filter((event) => event.entityId === ownedUnit.id);
    expect(ownedUnitAuditEvents).toHaveLength(2);
    expect(ownedUnitAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'created' }),
        expect.objectContaining({
          action: 'updated',
          changes: {
            ownerCustomerId: { from: null, to: context.seed.riversideId },
            ownershipTransferDate: { from: null, to: '2026-07-29' },
          },
        }),
      ]),
    );
  });
});

describe('lockUnitForOwnership', () => {
  test('advances one handle so sequential Transfers derive the latest origin', async ({ context }) => {
    await context.db.transaction(async (tx) => {
      const ownership = await lockUnitForOwnership(tx, context.seed.unitId);
      if (!ownership) throw new Error('Seeded Product Unit was not found');

      await ownership.record({
        actorUserId: ACTOR_USER_ID,
        occurredOn: '2026-06-01',
        toCustomerId: context.seed.riversideId,
      });
      await ownership.record({
        actorUserId: ACTOR_USER_ID,
        occurredOn: '2026-06-01',
        toCustomerId: context.seed.hilltopId,
      });
    });

    const transfers = await context.db
      .select()
      .from(productUnitOwnershipTransfers)
      .where(eq(productUnitOwnershipTransfers.productUnitId, context.seed.unitId));
    const first = transfers.find((transfer) => transfer.toCustomerId === context.seed.riversideId);
    const second = transfers.find((transfer) => transfer.toCustomerId === context.seed.hilltopId);
    if (!first || !second) throw new Error('Sequential Ownership Transfers were not both recorded');

    expect(first).toMatchObject({ fromCustomerId: null });
    expect(second).toMatchObject({ fromCustomerId: context.seed.riversideId });
    expect(second.createdAt.getTime()).toBeGreaterThan(first.createdAt.getTime());

    const currentOwnerId = await context.db.transaction(async (tx) => {
      const ownership = await lockUnitForOwnership(tx, context.seed.unitId);
      return ownership?.currentOwnerId;
    });
    expect(currentOwnerId).toBe(context.seed.hilltopId);
  });

  test('makes future-date, no-op, and backdate checks unavoidable through record', async ({ context }) => {
    await context.db.transaction(async (tx) => {
      const ownership = await lockUnitForOwnership(tx, context.seed.unitId);
      if (!ownership) throw new Error('Seeded Product Unit was not found');

      await expect(
        ownership.record({
          actorUserId: ACTOR_USER_ID,
          occurredOn: '2999-01-01',
          toCustomerId: context.seed.riversideId,
        }),
      ).rejects.toBeInstanceOf(ProductUnitTransferInFutureError);
      await expect(
        ownership.record({
          actorUserId: ACTOR_USER_ID,
          occurredOn: '2026-06-01',
          toCustomerId: null,
        }),
      ).rejects.toBeInstanceOf(ProductUnitOwnerUnchangedError);

      await ownership.record({
        actorUserId: ACTOR_USER_ID,
        occurredOn: '2026-06-01',
        toCustomerId: context.seed.riversideId,
      });

      await expect(
        ownership.record({
          actorUserId: ACTOR_USER_ID,
          occurredOn: '2026-05-31',
          toCustomerId: context.seed.hilltopId,
        }),
      ).rejects.toBeInstanceOf(ProductUnitTransferBackdatedError);
    });
  });
});

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

    const events = await readUpdateAuditEvents(context.db);

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

    expect(await readUpdateAuditEvents(context.db)).toHaveLength(1);
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

    const result = await listJobs({ db: context.db, input: JobListInput.parse({ limit: 50 }) });

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

  test('reports generic date errors before an unknown destination', async ({ context }) => {
    await expect(
      transfer(context, { occurredOn: '2999-01-01', toCustomerId: MISSING_CUSTOMER_ID }),
    ).rejects.toBeInstanceOf(ProductUnitTransferInFutureError);

    await transfer(context, { occurredOn: '2026-06-01', toCustomerId: context.seed.riversideId });

    await expect(
      transfer(context, { occurredOn: '2026-05-31', toCustomerId: MISSING_CUSTOMER_ID }),
    ).rejects.toBeInstanceOf(ProductUnitTransferBackdatedError);
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

  test('records the ownership change in the workspace audit feed', async ({ context }) => {
    await transfer(context, {
      note: 'Told to us by the buyer',
      occurredOn: '2026-06-01',
      toCustomerId: context.seed.riversideId,
    });

    expect(await readUpdateAuditEvents(context.db)).toEqual([
      expect.objectContaining({
        action: 'updated',
        actorUserId: ACTOR_USER_ID,
        changes: {
          ownerCustomerId: { from: null, to: context.seed.riversideId },
          ownershipTransferDate: { from: null, to: '2026-06-01' },
          ownershipTransferNote: { from: null, to: 'Told to us by the buyer' },
        },
        entityId: context.seed.unitId,
        summary: 'Updated product unit "VIN-001260001"',
      }),
    ]);
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

  const [serialProduct, otherSerialProduct] = await db
    .insert(products)
    .values([
      {
        basePrice: 1_000,
        buildTimeDays: 14,
        currencyCode: 'ZAR',
        description: null,
        modelCode: 'SER-A',
        name: 'Serial Test Product A',
        rangeId,
      },
      {
        basePrice: 1_000,
        buildTimeDays: 14,
        currencyCode: 'ZAR',
        description: null,
        modelCode: 'SER-B',
        name: 'Serial Test Product B',
        rangeId,
      },
    ])
    .returning();
  if (!serialProduct || !otherSerialProduct) throw new Error('Serial test Product insert did not return every row');

  const unit = await db.transaction((tx) =>
    createProductUnit({
      actorUserId: ACTOR_USER_ID,
      initialOwner: null,
      plantToday: DateOnlyIso.parse('2026-05-01'),
      productId: product.id,
      tx,
    }),
  );

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

  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: riverside.id,
      productId: serialProduct.id,
      quotedBasePrice: 1_000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: ACTOR_USER_ID,
    })
    .returning();
  if (!quote) throw new Error('Quote insert did not return a row');

  return {
    hilltopId: hilltop.id,
    otherSerialProductId: otherSerialProduct.id,
    quoteId: quote.id,
    riversideId: riverside.id,
    serialProductId: serialProduct.id,
    unitId: unit.id,
  };
}
