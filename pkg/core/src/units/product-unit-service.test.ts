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
  removeProductUnit,
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

describe('removeProductUnit', () => {
  test('deletes a machine that was never built, leaving its cancelled Job and Quote standing', async ({ context }) => {
    const phantom = await seedPhantomUnit(context);

    await removeProductUnit({ actorUserId: ACTOR_USER_ID, db: context.db, id: phantom.unitId });

    await expect(context.db.select().from(productUnits).where(eq(productUnits.id, phantom.unitId))).resolves.toEqual(
      [],
    );
    // The Job keeps its Quote — which the Quote's own foreign key then keeps standing — and loses only
    // its link to a machine that no longer exists.
    const [job] = await context.db.select().from(jobs).where(eq(jobs.id, phantom.jobId));
    expect(job).toMatchObject({ productUnitId: null, quoteId: phantom.quoteId });
    expect(job?.quoteId).not.toBeNull();
  });

  // The real phantom from a cancelled build-to-order sale: allocated to the Customer when the Unit was
  // minted, then handed back to Stock by the cancellation. Both Transfers go with the machine.
  test('takes the reversed allocation history of the machine that never was with it', async ({ context }) => {
    const phantom = await seedPhantomUnit(context, { owner: 'sold-then-returned' });

    await removeProductUnit({ actorUserId: ACTOR_USER_ID, db: context.db, id: phantom.unitId });

    await expect(
      context.db.$count(productUnitOwnershipTransfers, eq(productUnitOwnershipTransfers.productUnitId, phantom.unitId)),
    ).resolves.toBe(0);
  });

  test('records the removal in the workspace audit feed, naming the serial that is gone', async ({ context }) => {
    const phantom = await seedPhantomUnit(context);

    await removeProductUnit({ actorUserId: ACTOR_USER_ID, db: context.db, id: phantom.unitId });

    expect((await readAuditEvents(context.db)).filter((event) => event.action === 'deleted')).toEqual([
      expect.objectContaining({
        action: 'deleted',
        actorUserId: ACTOR_USER_ID,
        entityId: phantom.unitId,
        summary: `Deleted product unit "${phantom.productSerialNumber}"`,
      }),
    ]);
  });

  // Without this the Job's own history ends on a Unit id that resolves to nothing, and the only record
  // of the detach sits on an entity that no longer exists.
  test('records losing the machine against the Job that was detached', async ({ context }) => {
    const phantom = await seedPhantomUnit(context);

    await removeProductUnit({ actorUserId: ACTOR_USER_ID, db: context.db, id: phantom.unitId });

    const jobEvents = await context.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityType, 'job'))
      .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));

    expect(jobEvents).toEqual([
      expect.objectContaining({
        action: 'updated',
        actorUserId: ACTOR_USER_ID,
        changes: { productUnitId: { from: phantom.unitId, to: null } },
        entityId: phantom.jobId,
      }),
    ]);
  });

  test('refuses a machine whose build is still live, and leaves it whole', async ({ context }) => {
    await expect(
      removeProductUnit({ actorUserId: ACTOR_USER_ID, db: context.db, id: context.seed.unitId }),
    ).rejects.toMatchObject({ code: 'product_unit.in_use', metadata: { reason: 'live-job' } });

    await expect(context.db.$count(productUnits, eq(productUnits.id, context.seed.unitId))).resolves.toBe(1);
  });

  // Ownership is no longer a refusal: a phantom from a dead sale is born owned, and an administrator
  // is the one who can say the machine never existed. The build guards below still hold the line.
  test('deletes a machine a Customer still holds, taking its ownership history with it', async ({ context }) => {
    const phantom = await seedPhantomUnit(context, { owner: 'sold' });

    await removeProductUnit({ actorUserId: ACTOR_USER_ID, db: context.db, id: phantom.unitId });

    await expect(context.db.$count(productUnits, eq(productUnits.id, phantom.unitId))).resolves.toBe(0);
    await expect(
      context.db.$count(productUnitOwnershipTransfers, eq(productUnitOwnershipTransfers.productUnitId, phantom.unitId)),
    ).resolves.toBe(0);
  });

  // Cancelling a Quote does not care whether its Job already finished, and a Job Completion latches. A
  // machine that was built and then handed back to Stock must not look like one that never existed.
  test('refuses a machine whose Job was completed before it was cancelled', async ({ context }) => {
    const phantom = await seedPhantomUnit(context, { completedOn: '2026-05-04', owner: 'sold-then-returned' });

    await expect(
      removeProductUnit({ actorUserId: ACTOR_USER_ID, db: context.db, id: phantom.unitId }),
    ).rejects.toMatchObject({ code: 'product_unit.in_use', metadata: { reason: 'built' } });
  });

  // The cancelled Stock Build: no sale behind it, so detaching leaves a Job holding neither machine
  // nor Quote. It survives anyway as the record that someone once meant to build this.
  test('deletes the machine of a cancelled Stock Build, leaving the Job standing with neither', async ({ context }) => {
    const phantom = await seedPhantomUnit(context, { quote: 'none' });

    await removeProductUnit({ actorUserId: ACTOR_USER_ID, db: context.db, id: phantom.unitId });

    await expect(context.db.$count(productUnits, eq(productUnits.id, phantom.unitId))).resolves.toBe(0);
    const [job] = await context.db.select().from(jobs).where(eq(jobs.id, phantom.jobId));
    expect(job).toMatchObject({ productUnitId: null, quoteId: null });
    expect(job?.cancelledAt).not.toBeNull();
  });

  test('detaches a cancelled Quote that named the machine, leaving the Quote standing', async ({ context }) => {
    const phantom = await seedPhantomUnit(context, { quote: 'allocation' });

    await removeProductUnit({ actorUserId: ACTOR_USER_ID, db: context.db, id: phantom.unitId });

    await expect(context.db.$count(productUnits, eq(productUnits.id, phantom.unitId))).resolves.toBe(0);
    const [quote] = await context.db
      .select()
      .from(quotes)
      .where(eq(quotes.id, phantom.quoteId ?? ''));
    expect(quote).toMatchObject({ productUnitId: null, status: 'cancelled' });
  });

  test('records losing the machine against the cancelled Quote that was detached', async ({ context }) => {
    const phantom = await seedPhantomUnit(context, { quote: 'allocation' });

    await removeProductUnit({ actorUserId: ACTOR_USER_ID, db: context.db, id: phantom.unitId });

    const quoteEvents = await context.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityType, 'quote'))
      .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));

    expect(quoteEvents).toEqual([
      expect.objectContaining({
        action: 'updated',
        actorUserId: ACTOR_USER_ID,
        changes: { productUnitId: { from: phantom.unitId, to: null } },
        entityId: phantom.quoteId,
      }),
    ]);
  });

  test('refuses a machine a live Quote still points at', async ({ context }) => {
    const phantom = await seedPhantomUnit(context, { quote: 'allocation-live' });

    await expect(
      removeProductUnit({ actorUserId: ACTOR_USER_ID, db: context.db, id: phantom.unitId }),
    ).rejects.toMatchObject({ code: 'product_unit.in_use', metadata: { reason: 'quoted' } });
  });

  test('reports a machine that does not exist as not found', async ({ context }) => {
    await expect(
      removeProductUnit({ actorUserId: ACTOR_USER_ID, db: context.db, id: MISSING_UNIT_ID }),
    ).rejects.toMatchObject({ code: 'product_unit.not_found' });
  });
});

/**
 * A Unit that was minted by a build that never ran: the Job is cancelled, and nothing else claims it.
 * The options each break one precondition so a guard has something real to refuse.
 */
async function seedPhantomUnit(
  context: { db: Db; seed: Awaited<ReturnType<typeof seedUnit>> },
  options: {
    completedOn?: string;
    owner?: 'stock' | 'sold' | 'sold-then-returned';
    quote?: 'build-to-order' | 'none' | 'allocation' | 'allocation-live';
  } = {},
) {
  const { completedOn = null, owner = 'stock', quote: quoteKind = 'build-to-order' } = options;
  const { db, seed } = context;
  const now = new Date('2026-05-02T08:00:00.000Z');

  const unit = await db.transaction((tx) =>
    createProductUnit({
      actorUserId: ACTOR_USER_ID,
      initialOwner: owner === 'stock' ? null : { customerId: seed.riversideId, sourceQuoteId: seed.quoteId },
      plantToday: DateOnlyIso.parse('2026-05-02'),
      productId: seed.serialProductId,
      tx,
    }),
  );

  if (owner === 'sold-then-returned') {
    await db.transaction(async (tx) => {
      const ownership = await lockUnitForOwnership(tx, unit.id);
      if (!ownership) throw new Error('Seeded Unit was not found under its ownership lock');
      await ownership.record({ actorUserId: ACTOR_USER_ID, occurredOn: '2026-05-03', toCustomerId: null });
    });
  }

  let quoteId: string | null = null;

  if (quoteKind !== 'none') {
    const live = quoteKind === 'allocation-live';
    const [quote] = await db
      .insert(quotes)
      .values({
        customerId: seed.riversideId,
        productId: seed.serialProductId,
        productUnitId: quoteKind === 'allocation' || live ? unit.id : null,
        quotedBasePrice: 1_000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: live ? 'sent' : 'cancelled',
        cancellationReason: live ? null : 'Buyer withdrew',
      })
      .returning();
    if (!quote) throw new Error('Phantom Quote insert did not return a row');
    quoteId = quote.id;
  }

  const [job] = await db
    .insert(jobs)
    .values({ cancelledAt: now, completedOn, createdAt: now, productUnitId: unit.id, quoteId, updatedAt: now })
    .returning();
  if (!job) throw new Error('Phantom Job insert did not return a row');

  return { jobId: job.id, productSerialNumber: unit.productSerialNumber, quoteId, unitId: unit.id };
}

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
