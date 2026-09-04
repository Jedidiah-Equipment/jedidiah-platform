import { type Db, user } from '@pkg/db';
import {
  customers,
  jobs,
  parts,
  products,
  productUnitOwnershipTransfers,
  productUnits,
  quotes,
  supplier,
} from '@pkg/db/equipment';
import { formatQuoteCode } from '@pkg/schema/equipment';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { postAdjustment, postJobMovement } from '../inventory/stock-movement-service.js';
import { createTester } from '../test/create-tester.js';
import { partValues } from '../test/part-fixtures.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { listOnHandProductUnitStock } from './product-unit-stock-export.js';

const ACTOR_USER_ID = 'stock-export-test-user';
const NO_FILTERS = { columnFilters: {}, search: '' } as const;

const test = createTester(async ({ db }) => seedStockShape(db));

/** One Job per day from 1 May, so "earliest live Job" is a fact of the seed rather than of row order. */
function jobCreatedAt(day: number): Date {
  return new Date(`2026-05-${day.toString().padStart(2, '0')}T08:00:00.000Z`);
}

describe('listOnHandProductUnitStock', () => {
  test('puts the ledger cost beside the Product retail price on one line per On Hand Unit', async ({ context }) => {
    const rows = await listOnHandProductUnitStock({ db: context.db, input: NO_FILTERS });

    // Exhaustive and ordered, so it also pins the subject: the In Build Unit is absent, and the
    // Cancelled rework's 3 drawn units are absent from the machine we still hold, which cost zero.
    expect(rows).toEqual([
      // A machine we still hold: no Customer, no Quote, and its retail is what the model lists for.
      expect.objectContaining({
        buildCompletedOn: '2026-07-10',
        costExVat: 0,
        costIncVat: 0,
        customerCompanyName: null,
        invoiceNumber: null,
        productModelCode: 'SR-100',
        productName: 'Silage Trailer',
        productRetailExVat: 100_000,
        productRetailIncVat: 115_000,
        productSerialNumber: 'SR-100260002',
        quoteCode: null,
      }),
      expect.objectContaining({
        buildCompletedOn: '2026-07-12',
        productSerialNumber: 'SR-100260004',
      }),
      expect.objectContaining({
        buildCompletedOn: '2026-07-15',
        // 6 drawn at 10 with 2 handed back on the build, plus 1 on the rework.
        costExVat: 50,
        costIncVat: 57.5,
        customerCompanyName: 'Riverside Farm',
        invoiceNumber: 'INV-2026-0044',
        jobCode: expect.stringMatching(/^JOB-\d{5}$/),
        productSerialNumber: 'SR-100260001',
      }),
      expect.objectContaining({
        buildCompletedOn: '2026-07-18',
        customerCompanyName: 'Riverside Farm',
        invoiceNumber: 'INV-2026-0099',
        productSerialNumber: 'SR-100260005',
      }),
    ]);
  });

  test('leaves the cost empty rather than short when a Unit holds material nobody has priced', async ({ context }) => {
    const rows = await listOnHandProductUnitStock({ db: context.db, input: NO_FILTERS });
    const unpriced = rows.find((row) => row.productSerialNumber === 'SR-100260004');

    expect(unpriced).toMatchObject({ costExVat: null, costIncVat: null });
  });

  test('names the Quote that sold a machine out of stock rather than its build', async ({ context }) => {
    const rows = await listOnHandProductUnitStock({ db: context.db, input: NO_FILTERS });
    const allocated = rows.find((row) => row.productSerialNumber === 'SR-100260005');

    expect(allocated).toMatchObject({ quoteCode: context.allocationQuoteCode, invoiceNumber: 'INV-2026-0099' });
  });

  test('narrows to the machines we still hold when the list does', async ({ context }) => {
    const rows = await listOnHandProductUnitStock({
      db: context.db,
      input: { columnFilters: { buildState: 'on-hand' }, search: '' },
    });

    expect(rows.map((row) => row.productSerialNumber)).toEqual(['SR-100260002', 'SR-100260004']);
  });

  /**
   * A return to Stock is recorded as a Transfer with no destination that still names the Quote it
   * reverses — `returnQuoteProductUnitToStock` writes exactly that. Reading the sale off the newest
   * Transfer alone would print a cancelled Quote's number and invoice against a machine we have taken
   * back, while its Customer cell sat empty.
   */
  test('names no sale on a machine taken back into Stock, whatever Quote the reversal cites', async ({ context }) => {
    await context.db.insert(productUnitOwnershipTransfers).values({
      actorUserId: ACTOR_USER_ID,
      fromCustomerId: context.riversideId,
      occurredOn: '2026-07-20',
      productUnitId: context.allocatedUnitId,
      sourceQuoteId: context.allocationQuoteId,
      toCustomerId: null,
    });

    const rows = await listOnHandProductUnitStock({ db: context.db, input: NO_FILTERS });
    const returned = rows.find((row) => row.productSerialNumber === 'SR-100260005');

    expect(returned).toMatchObject({ customerCompanyName: null, invoiceNumber: null, quoteCode: null });
  });

  /**
   * The filter that contradicts the report's subject. Narrowing to In Build cannot make the report
   * smaller, so it is dropped rather than allowed to empty it — a headers-only CSV with no
   * explanation is the one outcome an export button must not have.
   */
  test('drops an In Build filter instead of exporting nothing at all', async ({ context }) => {
    const rows = await listOnHandProductUnitStock({
      db: context.db,
      input: { columnFilters: { buildState: 'in-build' }, search: '' },
    });

    expect(rows.map((row) => row.productSerialNumber)).toEqual([
      'SR-100260002',
      'SR-100260004',
      'SR-100260001',
      'SR-100260005',
    ]);
  });

  test('searches the way the Units list does', async ({ context }) => {
    const rows = await listOnHandProductUnitStock({
      db: context.db,
      input: { columnFilters: {}, search: 'SR-100260001' },
    });

    expect(rows.map((row) => row.productSerialNumber)).toEqual(['SR-100260001']);
  });
});

/**
 * One of every On Hand shape the report has to answer for — a machine built to order, one we still
 * hold, one holding unpriced material, one sold out of stock on an Allocation Quote — plus the In
 * Build Unit it must leave out and the Cancelled Job whose draws it must not count.
 */
async function seedStockShape(db: Db) {
  const now = new Date('2026-05-01T08:00:00.000Z');

  await db.insert(user).values({
    createdAt: now,
    email: 'stock-export@example.com',
    emailVerified: true,
    id: ACTOR_USER_ID,
    name: 'Stock Export Tester',
    role: 'admin',
    updatedAt: now,
  });

  const rangeId = await createProductRangeFixture(db);
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 100_000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      description: null,
      modelCode: 'SR-100',
      name: 'Silage Trailer',
      rangeId,
    })
    .returning();
  if (!product) throw new Error('Product insert did not return a row');

  const [riverside] = await db.insert(customers).values({ companyName: 'Riverside Farm' }).returning();
  if (!riverside) throw new Error('Customer insert did not return a row');

  const [soldUnit, stockUnit, openUnit, unpricedUnit, allocatedUnit] = await db
    .insert(productUnits)
    .values(
      ['SR-100260001', 'SR-100260002', 'SR-100260003', 'SR-100260004', 'SR-100260005'].map((serial, index) => ({
        productId: product.id,
        productSerialNumber: serial,
        productSerialPrefix: 'SR-100',
        productSerialSequence: index + 1,
        productSerialYear: 26,
      })),
    )
    .returning();
  if (!soldUnit || !stockUnit || !openUnit || !unpricedUnit || !allocatedUnit) {
    throw new Error('Product Unit inserts did not return every row');
  }

  const [buildQuote, allocationQuote] = await db
    .insert(quotes)
    .values([
      {
        customerId: riverside.id,
        invoiceNumber: 'INV-2026-0044',
        productId: product.id,
        quotedBasePrice: 100_000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: 'accepted',
      },
      {
        customerId: riverside.id,
        invoiceNumber: 'INV-2026-0099',
        productId: product.id,
        productUnitId: allocatedUnit.id,
        quotedBasePrice: 100_000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: 'accepted',
      },
    ])
    .returning();
  if (!buildQuote || !allocationQuote) throw new Error('Quote inserts did not return every row');

  await db.insert(productUnitOwnershipTransfers).values([
    {
      actorUserId: ACTOR_USER_ID,
      occurredOn: '2026-06-01',
      productUnitId: soldUnit.id,
      sourceQuoteId: buildQuote.id,
      toCustomerId: riverside.id,
    },
    {
      actorUserId: ACTOR_USER_ID,
      occurredOn: '2026-07-19',
      productUnitId: allocatedUnit.id,
      sourceQuoteId: allocationQuote.id,
      toCustomerId: riverside.id,
    },
  ]);

  // Explicit creation instants: a Unit's Build Job is its earliest live Job, and rows inserted in one
  // statement would all share the transaction's `now()` and tie-break on a random id instead.
  const [buildJob, reworkJob, stockBuildJob, cancelledReworkJob, openJob, unpricedJob, allocatedBuildJob] = await db
    .insert(jobs)
    .values([
      { createdAt: jobCreatedAt(1), productUnitId: soldUnit.id, quoteId: buildQuote.id },
      { createdAt: jobCreatedAt(2), productUnitId: soldUnit.id },
      { createdAt: jobCreatedAt(3), productUnitId: stockUnit.id },
      // Cancelled below, after its draw: the ledger refuses a movement against a Cancelled Job.
      { createdAt: jobCreatedAt(4), productUnitId: stockUnit.id },
      { createdAt: jobCreatedAt(5), productUnitId: openUnit.id },
      { createdAt: jobCreatedAt(6), productUnitId: unpricedUnit.id },
      { createdAt: jobCreatedAt(7), productUnitId: allocatedUnit.id },
    ])
    .returning();
  if (
    !buildJob ||
    !reworkJob ||
    !stockBuildJob ||
    !cancelledReworkJob ||
    !openJob ||
    !unpricedJob ||
    !allocatedBuildJob
  ) {
    throw new Error('Job inserts did not return every row');
  }

  const [createdSupplier] = await db
    .insert(supplier)
    .values({ companyName: 'Stock Export Supplier' })
    .returning({ id: supplier.id });
  if (!createdSupplier) throw new Error('Supplier insert did not return a row');

  const [costedPart, unpricedPart] = await db
    .insert(parts)
    .values([
      partValues({ code: 'COSTED', supplierId: createdSupplier.id, unitOfMeasure: 'piece' }),
      partValues({ code: 'UNPRICED', supplierId: createdSupplier.id, unitOfMeasure: 'piece' }),
    ])
    .returning();
  if (!costedPart || !unpricedPart) throw new Error('Part inserts did not return every row');

  await postAdjustment({
    actorUserId: ACTOR_USER_ID,
    db,
    input: { delta: 20, lengthMm: null, note: null, partId: costedPart.id, reason: 'opening-balance', unitCost: 10 },
  });
  for (const [jobId, quantity] of [
    [buildJob.id, 6],
    [reworkJob.id, 1],
    // Drawn against a build that never happened: the machine in the yard did not cost this.
    [cancelledReworkJob.id, 3],
  ] as const) {
    await postJobMovement({
      actorUserId: ACTOR_USER_ID,
      db,
      input: { jobId, lengthMm: null, partId: costedPart.id, quantity },
      movementType: 'checkout',
    });
  }
  await postJobMovement({
    actorUserId: ACTOR_USER_ID,
    db,
    input: { jobId: buildJob.id, lengthMm: null, partId: costedPart.id, quantity: 2 },
    movementType: 'return-to-store',
  });

  // Stock that arrived with no cost against it, which makes its Unit's total unknowable rather than small.
  await postAdjustment({
    actorUserId: ACTOR_USER_ID,
    db,
    input: { delta: 5, lengthMm: null, note: null, partId: unpricedPart.id, reason: 'opening-balance', unitCost: null },
  });
  await postJobMovement({
    actorUserId: ACTOR_USER_ID,
    db,
    input: { jobId: unpricedJob.id, lengthMm: null, partId: unpricedPart.id, quantity: 3 },
    movementType: 'checkout',
  });

  // Completion is stamped after the draws so the movements post against live Jobs. The rework we
  // cancel is completed too, proving the export skips it for being Cancelled and not for being open.
  for (const [jobId, completedOn] of [
    [buildJob.id, '2026-07-15'],
    [reworkJob.id, '2026-07-16'],
    [stockBuildJob.id, '2026-07-10'],
    [cancelledReworkJob.id, '2026-07-11'],
    [unpricedJob.id, '2026-07-12'],
    [allocatedBuildJob.id, '2026-07-18'],
  ] as const) {
    await db.update(jobs).set({ completedOn }).where(eq(jobs.id, jobId));
  }
  await db.update(jobs).set({ cancelledAt: now }).where(eq(jobs.id, cancelledReworkJob.id));

  return {
    allocatedUnitId: allocatedUnit.id,
    allocationQuoteCode: formatQuoteCode(allocationQuote.code),
    allocationQuoteId: allocationQuote.id,
    riversideId: riverside.id,
  };
}
