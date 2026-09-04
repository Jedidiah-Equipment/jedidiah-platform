import { auditEvents, createDatabaseClient, type Db, user } from '@pkg/db';
import {
  customers,
  jobBuildSpecAssemblies,
  jobs,
  products,
  productUnitOwnershipTransfers,
  quoteSelectedAssemblies,
  quotes,
} from '@pkg/db/equipment';
import { getPlantDateNow } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { and, asc, eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { QuoteLockedError } from '../quotes/quote-errors.js';
import { cancelQuote, patchQuote } from '../quotes/quote-service.js';
import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { reassignProductUnitToQuote } from './product-unit-reassignment.js';
import {
  ProductUnitReassignDeadJobError,
  ProductUnitReassignDisplacedOwnerError,
  ProductUnitReassignQuoteIneligibleError,
} from './product-unit-reassignment-errors.js';
import { listReassignCandidates, previewReassignment } from './product-unit-reassignment-read.js';
import { createProductUnit, lockUnitForOwnership } from './product-unit-service.js';

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000a1';

const test = createTester(async ({ db }) => ({ db, seed: await seedWorkspace(db) }));

describe('reassignProductUnitToQuote', () => {
  // Leg 1 of the Palmiet/Greg swap: Greg's nearly-finished machine is poached onto Palmiet's deal,
  // and Palmiet's own build is displaced back to Stock in the same transaction.
  test('moves the Unit and its build Job across, displacing the receiving deal Unit to Stock', async ({ context }) => {
    const { db, seed } = context;
    const palmiet = await createBuildToOrderDeal(db, seed, seed.palmietId);
    const greg = await createBuildToOrderDeal(db, seed, seed.gregId);

    const result = await reassignProductUnitToQuote({
      actorUserId: ACTOR_USER_ID,
      db,
      input: { note: 'Palmiet needs it first', productUnitId: greg.unitId, toQuoteId: palmiet.quoteId },
    });

    expect(result).toMatchObject({
      displacedProductSerialNumber: palmiet.productSerialNumber,
      jobId: greg.jobId,
      unit: { id: greg.unitId },
    });
    await expect(readJobQuoteId(db, greg.jobId)).resolves.toBe(palmiet.quoteId);
    await expect(readJobQuoteId(db, palmiet.jobId)).resolves.toBeNull();
    // A direct row, never a fictional round trip via Stock: the machine went from Greg to Palmiet.
    await expect(readTransfers(db, greg.unitId)).resolves.toEqual([
      { fromCustomerId: null, note: null, sourceQuoteId: greg.quoteId, toCustomerId: seed.gregId },
      {
        fromCustomerId: seed.gregId,
        note: 'Palmiet needs it first',
        sourceQuoteId: palmiet.quoteId,
        toCustomerId: seed.palmietId,
      },
    ]);
    // The displaced machine genuinely comes back to us, so its reversal row is honest.
    await expect(readTransfers(db, palmiet.unitId)).resolves.toEqual([
      { fromCustomerId: null, note: null, sourceQuoteId: palmiet.quoteId, toCustomerId: seed.palmietId },
      {
        fromCustomerId: seed.palmietId,
        note: 'Palmiet needs it first',
        sourceQuoteId: palmiet.quoteId,
        toCustomerId: null,
      },
    ]);
    await expect(readJobQuoteAudit(db, greg.jobId)).resolves.toEqual([{ from: greg.quoteId, to: palmiet.quoteId }]);
    await expect(readJobQuoteAudit(db, palmiet.jobId)).resolves.toEqual([{ from: palmiet.quoteId, to: null }]);
  });

  // Leg 2: the vacated deal takes the displaced machine, which by then is a Stock Build.
  test('attaches a Stock Build to a Quote with no live Job and sells the Unit out of Stock', async ({ context }) => {
    const { db, seed } = context;
    const quoteId = await createQuote(db, { customerId: seed.gregId, productId: seed.productId });
    const stock = await createStockBuild(db, seed);

    await reassignProductUnitToQuote({
      actorUserId: ACTOR_USER_ID,
      db,
      input: { note: null, productUnitId: stock.unitId, toQuoteId: quoteId },
    });

    await expect(readJobQuoteId(db, stock.jobId)).resolves.toBe(quoteId);
    await expect(readTransfers(db, stock.unitId)).resolves.toEqual([
      { fromCustomerId: null, note: null, sourceQuoteId: quoteId, toCustomerId: seed.gregId },
    ]);
  });

  // Completion is not a wall: a finished Stock Build is exactly the machine a customer wants sooner.
  test('attaches a completed Stock Build, which no mutability guard refuses', async ({ context }) => {
    const { db, seed } = context;
    const quoteId = await createQuote(db, { customerId: seed.gregId, productId: seed.productId });
    const stock = await createStockBuild(db, seed, { completedOn: '2026-06-01' });

    await reassignProductUnitToQuote({
      actorUserId: ACTOR_USER_ID,
      db,
      input: { note: null, productUnitId: stock.unitId, toQuoteId: quoteId },
    });

    await expect(readJobQuoteId(db, stock.jobId)).resolves.toBe(quoteId);
  });

  // The DB check `product_unit_ownership_transfer_moves_owner` would reject a row that moves nothing,
  // so the Job audit events are what carry a move between two deals of the same Customer.
  test('skips the Transfer row when the Unit already belongs to the receiving Customer', async ({ context }) => {
    const { db, seed } = context;
    const source = await createBuildToOrderDeal(db, seed, seed.gregId);
    const target = await createQuote(db, { customerId: seed.gregId, productId: seed.productId });

    await reassignProductUnitToQuote({
      actorUserId: ACTOR_USER_ID,
      db,
      input: { note: null, productUnitId: source.unitId, toQuoteId: target },
    });

    await expect(readJobQuoteId(db, source.jobId)).resolves.toBe(target);
    await expect(readTransfers(db, source.unitId)).resolves.toEqual([
      { fromCustomerId: null, note: null, sourceQuoteId: source.quoteId, toCustomerId: seed.gregId },
    ]);
    await expect(readJobQuoteAudit(db, source.jobId)).resolves.toEqual([{ from: source.quoteId, to: target }]);
  });

  // Unit Removal's precedent: the vacated Allocation Quote loses its machine against its own history.
  test('clears the vacated Allocation Quote productUnitId with its own audit event', async ({ context }) => {
    const { db, seed } = context;
    const stock = await createStockBuild(db, seed);
    const allocationQuoteId = await createQuote(db, {
      customerId: seed.gregId,
      productId: seed.productId,
      productUnitId: stock.unitId,
    });
    await sellUnit(db, { customerId: seed.gregId, productUnitId: stock.unitId, sourceQuoteId: allocationQuoteId });
    const receivingQuoteId = await createQuote(db, { customerId: seed.palmietId, productId: seed.productId });

    await reassignProductUnitToQuote({
      actorUserId: ACTOR_USER_ID,
      db,
      input: { note: null, productUnitId: stock.unitId, toQuoteId: receivingQuoteId },
    });

    await expect(readQuoteProductUnitId(db, allocationQuoteId)).resolves.toBeNull();
    await expect(readQuoteProductUnitAudit(db, allocationQuoteId)).resolves.toEqual([{ from: stock.unitId, to: null }]);
    await expect(readJobQuoteId(db, stock.jobId)).resolves.toBe(receivingQuoteId);
  });
});

describe('reassignProductUnitToQuote refusals', () => {
  test('refuses a receiving Quote that is invoiced, unaccepted, custom, or an Allocation Quote', async ({
    context,
  }) => {
    const { db, seed } = context;
    const greg = await createBuildToOrderDeal(db, seed, seed.gregId);
    const allocationTarget = await createStockBuild(db, seed);
    const cases: [string, UUID][] = [
      [
        'invoiced',
        await createQuote(db, { customerId: seed.palmietId, invoiceNumber: 'INV-1', productId: seed.productId }),
      ],
      [
        'not-accepted',
        await createQuote(db, { customerId: seed.palmietId, productId: seed.productId, status: 'sent' }),
      ],
      ['not-product', await createCustomQuote(db, seed.palmietId)],
      [
        'allocation-quote',
        await createQuote(db, {
          customerId: seed.palmietId,
          productId: seed.productId,
          productUnitId: allocationTarget.unitId,
        }),
      ],
    ];

    for (const [reason, toQuoteId] of cases) {
      await expect(
        reassignProductUnitToQuote({
          actorUserId: ACTOR_USER_ID,
          db,
          input: { note: null, productUnitId: greg.unitId, toQuoteId },
        }),
        reason,
      ).rejects.toMatchObject({ metadata: { reason } });
    }
  });

  test('directs the operator to cancel a live Job that has lost its machine', async ({ context }) => {
    const { db, seed } = context;
    const palmiet = await createBuildToOrderDeal(db, seed, seed.palmietId);
    const greg = await createBuildToOrderDeal(db, seed, seed.gregId);
    await db.update(jobs).set({ productUnitId: null }).where(eq(jobs.id, palmiet.jobId));

    await expect(
      reassignProductUnitToQuote({
        actorUserId: ACTOR_USER_ID,
        db,
        input: { note: null, productUnitId: greg.unitId, toQuoteId: palmiet.quoteId },
      }),
    ).rejects.toBeInstanceOf(ProductUnitReassignDeadJobError);
  });

  test('refuses a Unit built as another Product', async ({ context }) => {
    const { db, seed } = context;
    const quoteId = await createQuote(db, { customerId: seed.gregId, productId: seed.productId });
    const other = await createStockBuild(db, seed, { productId: seed.otherProductId });

    await expect(
      reassignProductUnitToQuote({
        actorUserId: ACTOR_USER_ID,
        db,
        input: { note: null, productUnitId: other.unitId, toQuoteId: quoteId },
      }),
    ).rejects.toMatchObject({ metadata: { reason: 'wrong-product' } });
  });

  // The wall is the deal the build Job is leaving, not only the ownership log: handing the machine
  // back by hand does not un-bill an invoice, and detaching a billed deal's Job would leave its
  // paperwork describing a machine that is no longer coming.
  test('refuses a Stock Unit whose build Job still hangs off an invoiced deal', async ({ context }) => {
    const { db, seed } = context;
    const greg = await createBuildToOrderDeal(db, seed, seed.gregId);
    await db.update(quotes).set({ invoiceNumber: 'INV-8' }).where(eq(quotes.id, greg.quoteId));
    await sellUnit(db, { customerId: null, productUnitId: greg.unitId, sourceQuoteId: null });
    const quoteId = await createQuote(db, { customerId: seed.palmietId, productId: seed.productId });

    await expect(
      reassignProductUnitToQuote({
        actorUserId: ACTOR_USER_ID,
        db,
        input: { note: null, productUnitId: greg.unitId, toQuoteId: quoteId },
      }),
    ).rejects.toMatchObject({ metadata: { reason: 'selling-quote-invoiced' } });
    await expect(listReassignCandidates({ db, quoteId })).resolves.toEqual([]);
  });

  test('refuses a Unit whose selling Quote has been invoiced', async ({ context }) => {
    const { db, seed } = context;
    const greg = await createBuildToOrderDeal(db, seed, seed.gregId);
    await db.update(quotes).set({ invoiceNumber: 'INV-7' }).where(eq(quotes.id, greg.quoteId));
    const quoteId = await createQuote(db, { customerId: seed.palmietId, productId: seed.productId });

    await expect(
      reassignProductUnitToQuote({
        actorUserId: ACTOR_USER_ID,
        db,
        input: { note: null, productUnitId: greg.unitId, toQuoteId: quoteId },
      }),
    ).rejects.toMatchObject({ metadata: { reason: 'selling-quote-invoiced' } });
  });

  // A hand-recorded Transfer attributes the machine to a third party outside any deal of ours.
  test('refuses a Unit owned through a Transfer with no sourcing Quote', async ({ context }) => {
    const { db, seed } = context;
    const stock = await createStockBuild(db, seed);
    await sellUnit(db, { customerId: seed.gregId, productUnitId: stock.unitId, sourceQuoteId: null });
    const quoteId = await createQuote(db, { customerId: seed.palmietId, productId: seed.productId });

    await expect(
      reassignProductUnitToQuote({
        actorUserId: ACTOR_USER_ID,
        db,
        input: { note: null, productUnitId: stock.unitId, toQuoteId: quoteId },
      }),
    ).rejects.toMatchObject({ metadata: { reason: 'owned-outside-deal' } });
  });

  test('refuses a Unit under a live Rework Job', async ({ context }) => {
    const { db, seed } = context;
    const stock = await createStockBuild(db, seed);
    const allocationQuoteId = await createQuote(db, {
      customerId: seed.gregId,
      productId: seed.productId,
      productUnitId: stock.unitId,
    });
    await sellUnit(db, { customerId: seed.gregId, productUnitId: stock.unitId, sourceQuoteId: allocationQuoteId });
    await db.insert(jobs).values({ productUnitId: stock.unitId, quoteId: allocationQuoteId });
    const quoteId = await createQuote(db, { customerId: seed.palmietId, productId: seed.productId });

    await expect(
      reassignProductUnitToQuote({
        actorUserId: ACTOR_USER_ID,
        db,
        input: { note: null, productUnitId: stock.unitId, toQuoteId: quoteId },
      }),
    ).rejects.toMatchObject({ metadata: { reason: 'live-rework' } });
  });

  test('refuses a Unit with no live build Job to attach', async ({ context }) => {
    const { db, seed } = context;
    const greg = await createBuildToOrderDeal(db, seed, seed.gregId);
    await db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, greg.jobId));
    const quoteId = await createQuote(db, { customerId: seed.palmietId, productId: seed.productId });

    await expect(
      reassignProductUnitToQuote({
        actorUserId: ACTOR_USER_ID,
        db,
        input: { note: null, productUnitId: greg.unitId, toQuoteId: quoteId },
      }),
    ).rejects.toMatchObject({ metadata: { reason: 'no-live-build-job' } });
  });

  test('refuses the Unit the receiving Quote is already building', async ({ context }) => {
    const { db, seed } = context;
    const palmiet = await createBuildToOrderDeal(db, seed, seed.palmietId);

    await expect(
      reassignProductUnitToQuote({
        actorUserId: ACTOR_USER_ID,
        db,
        input: { note: null, productUnitId: palmiet.unitId, toQuoteId: palmiet.quoteId },
      }),
    ).rejects.toMatchObject({ metadata: { reason: 'already-on-quote' } });
  });

  // A hand-recorded Transfer got there first, so returning the machine to Stock would take it off
  // whoever holds it now. That is a person's decision, not a side effect of someone else's swap.
  test('refuses when the displaced Unit is no longer owned by the receiving Customer', async ({ context }) => {
    const { db, seed } = context;
    const palmiet = await createBuildToOrderDeal(db, seed, seed.palmietId);
    const greg = await createBuildToOrderDeal(db, seed, seed.gregId);
    await sellUnit(db, { customerId: seed.thirdPartyId, productUnitId: palmiet.unitId, sourceQuoteId: null });

    await expect(
      reassignProductUnitToQuote({
        actorUserId: ACTOR_USER_ID,
        db,
        input: { note: null, productUnitId: greg.unitId, toQuoteId: palmiet.quoteId },
      }),
    ).rejects.toBeInstanceOf(ProductUnitReassignDisplacedOwnerError);
    await expect(readJobQuoteId(db, greg.jobId)).resolves.toBe(greg.quoteId);
  });

  // Both legs of a swap fired at once reach for the same two Jobs from opposite ends. Unless every Job
  // is locked in one ordered statement they deadlock on `job`, and Postgres 40P01 surfaces as a 500.
  //
  // Holding one Job first is what makes the race land: both legs pile up behind it, so releasing it
  // sets them going against each other rather than letting the first finish before the second starts.
  // Which leg wins the released lock is still the scheduler's choice, and only one of the two orders
  // closes a cycle, so the swap runs repeatedly. Twenty-five attempts was measured against the
  // two-statement implementation this replaced: red on every run, and green on every run of this one.
  test('does not deadlock when both legs of a swap run concurrently', async ({ context }) => {
    const { db, seed } = context;
    const legOne = createDatabaseClient(context.databaseUrl, { max: 1 });
    const legTwo = createDatabaseClient(context.databaseUrl, { max: 1 });

    try {
      for (let attempt = 0; attempt < 25; attempt++) {
        const palmiet = await createBuildToOrderDeal(db, seed, seed.palmietId);
        const greg = await createBuildToOrderDeal(db, seed, seed.gregId);
        let releaseHeldJob = () => {};
        const heldJobReleased = new Promise<void>((resolve) => {
          releaseHeldJob = resolve;
        });
        let signalJobHeld = () => {};
        const jobHeld = new Promise<void>((resolve) => {
          signalJobHeld = resolve;
        });

        const holder = db.transaction(async (tx) => {
          await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, greg.jobId)).for('update');
          signalJobHeld();
          await heldJobReleased;
        });
        await jobHeld;

        const swap = Promise.allSettled([
          reassignProductUnitToQuote({
            actorUserId: ACTOR_USER_ID,
            db: legOne.db,
            input: { note: null, productUnitId: greg.unitId, toQuoteId: palmiet.quoteId },
          }),
          reassignProductUnitToQuote({
            actorUserId: ACTOR_USER_ID,
            db: legTwo.db,
            input: { note: null, productUnitId: palmiet.unitId, toQuoteId: greg.quoteId },
          }),
        ]);
        // Both legs must be queued behind the held Job before it goes, or the first would simply finish.
        await expect
          .poll(async () => {
            const result = await db.execute<{ count: number }>(sql`
              select count(*)::int as count
              from pg_stat_activity
              where datname = current_database() and wait_event_type = 'Lock'
            `);
            return Number(result[0]?.count ?? 0);
          })
          .toBeGreaterThan(1);
        releaseHeldJob();
        await holder;

        const results = await swap;
        const deadlocked = results.filter(
          (result) => result.status === 'rejected' && (result.reason as { code?: string } | null)?.code === '40P01',
        );
        expect(deadlocked, `attempt ${attempt}: a swap must serialize on the Job locks, not deadlock`).toEqual([]);
      }
    } finally {
      await Promise.all([legOne.close(), legTwo.close()]);
    }
  });

  // Two operators reaching for the same machine must serialize on its row lock, so the loser reads the
  // state the winner left rather than writing a second claim over it.
  test('serializes two concurrent reassignments of one Unit', async ({ context }) => {
    const { db, seed } = context;
    const greg = await createBuildToOrderDeal(db, seed, seed.gregId);
    const first = await createQuote(db, { customerId: seed.palmietId, productId: seed.productId });
    const second = await createQuote(db, { customerId: seed.thirdPartyId, productId: seed.productId });
    const rival = createDatabaseClient(context.databaseUrl, { max: 1 });

    try {
      const results = await Promise.allSettled([
        reassignProductUnitToQuote({
          actorUserId: ACTOR_USER_ID,
          db,
          input: { note: null, productUnitId: greg.unitId, toQuoteId: first },
        }),
        reassignProductUnitToQuote({
          actorUserId: ACTOR_USER_ID,
          db: rival.db,
          input: { note: null, productUnitId: greg.unitId, toQuoteId: second },
        }),
      ]);

      // Both may succeed — the second simply moves the machine on again — but they cannot interleave:
      // the log must read as a chain, and the machine must end up owned by whoever the Job now builds for.
      expect(results.filter((result) => result.status === 'fulfilled').length).toBeGreaterThan(0);
      const transfers = await readTransfers(db, greg.unitId);
      const owners = transfers.map((transfer) => transfer.toCustomerId);
      expect(transfers.map((transfer) => transfer.fromCustomerId)).toEqual([null, ...owners.slice(0, -1)]);

      const finalQuoteId = await readJobQuoteId(db, greg.jobId);
      expect([first, second]).toContain(finalQuoteId);
      const [finalQuote] = await db
        .select({ customerId: quotes.customerId })
        .from(quotes)
        .where(eq(quotes.id, finalQuoteId ?? ''));
      expect(owners.at(-1)).toBe(finalQuote?.customerId);
    } finally {
      await rival.close();
    }
  });
});

// Reassignment empties the deal it takes the machine from. Everything that reads "this Quote sourced
// production" has to keep reading true, and everything that acts on "this Quote's machine" has to stop.
describe('the vacated deal', () => {
  // Decision 8: the source Quote stays accepted and Locked. The lock is derived, and re-pointing the
  // Job away removes the last `job.quote_id` row that derivation was reading.
  test('stays Locked against commercial edits after its build moves away', async ({ context }) => {
    const { db, seed } = context;
    const greg = await createBuildToOrderDeal(db, seed, seed.gregId);
    const receiving = await createQuote(db, { customerId: seed.palmietId, productId: seed.productId });
    await db
      .insert(quoteSelectedAssemblies)
      .values({ productAssemblyId: null, quotedName: 'Toolbox', quotedPrice: 500, quoteId: greg.quoteId });

    await reassignProductUnitToQuote({
      actorUserId: ACTOR_USER_ID,
      db,
      input: { note: null, productUnitId: greg.unitId, toQuoteId: receiving },
    });

    // Dropping a sold Assembly is a commercial edit, which a Quote that has sourced production refuses.
    await expect(
      patchQuote({ actorUserId: ACTOR_USER_ID, db, input: { id: greg.quoteId, selectedAssemblies: [] } }),
    ).rejects.toBeInstanceOf(QuoteLockedError);
  });

  // The machine now builds for someone else, so cancelling the deal it left must not reach for it.
  test('cancelling it leaves the receiving deal holding its machine', async ({ context }) => {
    const { db, seed } = context;
    const source = await createBuildToOrderDeal(db, seed, seed.gregId);
    // Same Customer on both deals, so reassignment writes no Transfer and the newest ownership row
    // still names the vacated Quote as the sale that placed the machine.
    const receiving = await createQuote(db, { customerId: seed.gregId, productId: seed.productId });

    await reassignProductUnitToQuote({
      actorUserId: ACTOR_USER_ID,
      db,
      input: { note: null, productUnitId: source.unitId, toQuoteId: receiving },
    });
    await cancelQuote({
      actorUserId: ACTOR_USER_ID,
      cancellationReason: 'Customer took the other trailer instead',
      db,
      id: source.quoteId,
      mayCancelLockedQuote: true,
    });

    await expect(readJobQuoteId(db, source.jobId)).resolves.toBe(receiving);
    await expect(readCurrentOwnerId(db, source.unitId)).resolves.toBe(seed.gregId);
  });

  // Across Customers the reversal cannot even find a coherent origin, so it used to refuse the
  // cancellation outright rather than leave the vacated deal alone.
  test('cancelling it is not blocked by the machine having moved to another Customer', async ({ context }) => {
    const { db, seed } = context;
    const source = await createBuildToOrderDeal(db, seed, seed.gregId);
    const receiving = await createQuote(db, { customerId: seed.palmietId, productId: seed.productId });

    await reassignProductUnitToQuote({
      actorUserId: ACTOR_USER_ID,
      db,
      input: { note: null, productUnitId: source.unitId, toQuoteId: receiving },
    });

    await cancelQuote({
      actorUserId: ACTOR_USER_ID,
      cancellationReason: 'Customer walked away',
      db,
      id: source.quoteId,
      mayCancelLockedQuote: true,
    });

    await expect(readQuoteStatus(db, source.quoteId)).resolves.toBe('cancelled');
    await expect(readCurrentOwnerId(db, source.unitId)).resolves.toBe(seed.palmietId);
    await expect(readJobQuoteId(db, source.jobId)).resolves.toBe(receiving);
  });
});

describe('listReassignCandidates', () => {
  test('offers same-Product movable Units and leaves out the ones that cannot move', async ({ context }) => {
    const { db, seed } = context;
    const palmiet = await createBuildToOrderDeal(db, seed, seed.palmietId);
    const greg = await createBuildToOrderDeal(db, seed, seed.gregId);
    const stock = await createStockBuild(db, seed, { completedOn: '2026-06-02' });
    const invoiced = await createBuildToOrderDeal(db, seed, seed.thirdPartyId);
    await db.update(quotes).set({ invoiceNumber: 'INV-9' }).where(eq(quotes.id, invoiced.quoteId));
    await createStockBuild(db, seed, { productId: seed.otherProductId });

    const candidates = await listReassignCandidates({ db, quoteId: palmiet.quoteId });

    expect(candidates.map((candidate) => candidate.productSerialNumber).toSorted()).toEqual(
      [greg.productSerialNumber, stock.productSerialNumber].toSorted(),
    );
    expect(candidates.find((candidate) => candidate.productSerialNumber === stock.productSerialNumber)).toMatchObject({
      buildState: 'on-hand',
      owner: null,
    });
    expect(candidates.find((candidate) => candidate.productSerialNumber === greg.productSerialNumber)).toMatchObject({
      buildState: 'in-build',
      owner: { companyName: 'Greg Todd' },
    });
  });

  test('refuses a Quote that cannot receive a Unit at all', async ({ context }) => {
    const { db, seed } = context;
    const quoteId = await createQuote(db, { customerId: seed.gregId, productId: seed.productId, status: 'draft' });

    await expect(listReassignCandidates({ db, quoteId })).rejects.toBeInstanceOf(
      ProductUnitReassignQuoteIneligibleError,
    );
  });
});

describe('previewReassignment', () => {
  test('names the displacement and the difference between what was sold and what is fitted', async ({ context }) => {
    const { db, seed } = context;
    const palmiet = await createBuildToOrderDeal(db, seed, seed.palmietId);
    const greg = await createBuildToOrderDeal(db, seed, seed.gregId);
    await db
      .insert(quoteSelectedAssemblies)
      .values({ productAssemblyId: null, quotedName: 'Toolbox', quotedPrice: 500, quoteId: palmiet.quoteId });
    await addBuildSpecAssembly(db, greg.jobId, 'Spare wheel');

    const preview = await previewReassignment({ db, productUnitId: greg.unitId, quoteId: palmiet.quoteId });

    expect(preview).toMatchObject({
      displaced: { id: palmiet.unitId, owner: { companyName: 'Palmiet Farm' } },
      incoming: { id: greg.unitId, owner: { companyName: 'Greg Todd' } },
      specDiff: { fittedNotQuoted: ['Spare wheel'], quotedNotFitted: ['Toolbox'] },
    });
  });
});

async function readJobQuoteId(db: Db, jobId: string): Promise<string | null> {
  const [job] = await db.select({ quoteId: jobs.quoteId }).from(jobs).where(eq(jobs.id, jobId));

  return job?.quoteId ?? null;
}

async function readQuoteStatus(db: Db, quoteId: string): Promise<string | null> {
  const [quote] = await db.select({ status: quotes.status }).from(quotes).where(eq(quotes.id, quoteId));

  return quote?.status ?? null;
}

async function readCurrentOwnerId(db: Db, productUnitId: string): Promise<string | null> {
  const transfers = await readTransfers(db, productUnitId);

  return transfers.at(-1)?.toCustomerId ?? null;
}

async function readQuoteProductUnitId(db: Db, quoteId: string): Promise<string | null> {
  const [quote] = await db.select({ productUnitId: quotes.productUnitId }).from(quotes).where(eq(quotes.id, quoteId));

  return quote?.productUnitId ?? null;
}

async function readTransfers(db: Db, productUnitId: string) {
  const rows = await db
    .select({
      fromCustomerId: productUnitOwnershipTransfers.fromCustomerId,
      note: productUnitOwnershipTransfers.note,
      sourceQuoteId: productUnitOwnershipTransfers.sourceQuoteId,
      toCustomerId: productUnitOwnershipTransfers.toCustomerId,
    })
    .from(productUnitOwnershipTransfers)
    .where(eq(productUnitOwnershipTransfers.productUnitId, productUnitId))
    .orderBy(asc(productUnitOwnershipTransfers.occurredOn), asc(productUnitOwnershipTransfers.createdAt));

  return rows;
}

async function readAuditChanges(db: Db, entityType: string, entityId: string, field: string) {
  const rows = await db
    .select({ changes: auditEvents.changes })
    .from(auditEvents)
    .where(and(eq(auditEvents.entityType, entityType), eq(auditEvents.entityId, entityId)))
    .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));

  return rows.flatMap((row) => {
    const change = (row.changes as Record<string, { from: unknown; to: unknown }> | null)?.[field];

    return change ? [change] : [];
  });
}

async function readJobQuoteAudit(db: Db, jobId: string) {
  return readAuditChanges(db, 'job', jobId, 'quoteId');
}

async function readQuoteProductUnitAudit(db: Db, quoteId: string) {
  return readAuditChanges(db, 'quote', quoteId, 'productUnitId');
}

type Seed = Awaited<ReturnType<typeof seedWorkspace>>;

async function createQuote(
  db: Db,
  options: {
    customerId: string;
    invoiceNumber?: string;
    productId: string;
    productUnitId?: string;
    status?: 'accepted' | 'draft' | 'sent';
  },
): Promise<UUID> {
  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: options.customerId,
      invoiceNumber: options.invoiceNumber ?? null,
      productId: options.productId,
      productUnitId: options.productUnitId ?? null,
      quotedBasePrice: 1_000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: ACTOR_USER_ID,
      status: options.status ?? 'accepted',
    })
    .returning({ id: quotes.id });

  if (!quote) throw new Error('Quote insert did not return a row');

  return quote.id as UUID;
}

async function createCustomQuote(db: Db, customerId: string): Promise<UUID> {
  const [quote] = await db
    .insert(quotes)
    .values({
      customerId,
      kind: 'custom',
      quotedBasePrice: 0,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: ACTOR_USER_ID,
      status: 'accepted',
      workTitle: 'Hydraulic overhaul',
    })
    .returning({ id: quotes.id });

  if (!quote) throw new Error('Custom Quote insert did not return a row');

  return quote.id as UUID;
}

/** A deal that ordered a machine: an accepted Quote, its build Job, and a Unit owned from minting. */
async function createBuildToOrderDeal(db: Db, seed: Seed, customerId: string) {
  const quoteId = await createQuote(db, { customerId, productId: seed.productId });
  const unit = await db.transaction((tx) =>
    createProductUnit({
      actorUserId: ACTOR_USER_ID,
      initialOwner: { customerId, sourceQuoteId: quoteId },
      plantToday: getPlantDateNow(),
      productId: seed.productId as UUID,
      tx,
    }),
  );
  const [job] = await db.insert(jobs).values({ productUnitId: unit.id, quoteId }).returning({ id: jobs.id });

  if (!job) throw new Error('Job insert did not return a row');

  return { jobId: job.id, productSerialNumber: unit.productSerialNumber, quoteId, unitId: unit.id as UUID };
}

/** A machine we hold: a Build Job with no Quote and nobody owning it. */
async function createStockBuild(db: Db, seed: Seed, options: { completedOn?: string; productId?: string } = {}) {
  const unit = await db.transaction((tx) =>
    createProductUnit({
      actorUserId: ACTOR_USER_ID,
      initialOwner: null,
      plantToday: getPlantDateNow(),
      productId: (options.productId ?? seed.productId) as UUID,
      tx,
    }),
  );
  const [job] = await db
    .insert(jobs)
    .values({ completedOn: options.completedOn ?? null, productUnitId: unit.id })
    .returning({ id: jobs.id });

  if (!job) throw new Error('Stock Build Job insert did not return a row');

  return { jobId: job.id, productSerialNumber: unit.productSerialNumber, unitId: unit.id as UUID };
}

async function sellUnit(
  db: Db,
  {
    customerId,
    productUnitId,
    sourceQuoteId,
  }: { customerId: string | null; productUnitId: string; sourceQuoteId: string | null },
) {
  await db.transaction(async (tx) => {
    const ownership = await lockUnitForOwnership(tx, productUnitId);

    if (!ownership) throw new Error('Seeded Unit was not found under its ownership lock');

    await ownership.record({
      actorUserId: ACTOR_USER_ID,
      occurredOn: getPlantDateNow(),
      sourceQuoteId,
      toCustomerId: customerId,
    });
  });
}

async function addBuildSpecAssembly(db: Db, jobId: string, assemblyName: string) {
  await db.insert(jobBuildSpecAssemblies).values({ assemblyName, jobId, productAssemblyId: null, sequence: 1 });
}

async function seedWorkspace(db: Db) {
  const now = new Date('2026-05-01T08:00:00.000Z');

  await db.insert(user).values({
    createdAt: now,
    email: 'reassignment@example.com',
    emailVerified: true,
    id: ACTOR_USER_ID,
    name: 'Reassignment Test User',
    role: 'admin',
    updatedAt: now,
  });

  const rangeId = await createProductRangeFixture(db);
  const [product, otherProduct] = await db
    .insert(products)
    .values([
      { basePrice: 1_000, buildTimeDays: 14, currencyCode: 'ZAR', modelCode: 'RSN-A', name: 'Tipper Trailer', rangeId },
      {
        basePrice: 1_000,
        buildTimeDays: 14,
        currencyCode: 'ZAR',
        modelCode: 'RSN-B',
        name: 'Flatbed Trailer',
        rangeId,
      },
    ])
    .returning();

  if (!product || !otherProduct) throw new Error('Product insert did not return every row');

  const [palmiet, greg, thirdParty] = await db
    .insert(customers)
    .values([
      { companyName: 'Palmiet Farm', email: null },
      { companyName: 'Greg Todd', email: null },
      { companyName: 'Kloof Haulage', email: null },
    ])
    .returning();

  if (!palmiet || !greg || !thirdParty) throw new Error('Customer insert did not return every row');

  return {
    gregId: greg.id,
    otherProductId: otherProduct.id,
    palmietId: palmiet.id,
    productId: product.id,
    thirdPartyId: thirdParty.id,
  };
}
