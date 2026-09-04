import { type Db, user } from '@pkg/db';
import {
  customers,
  jobs,
  parts,
  productAssemblies,
  products,
  productUnitOwnershipTransfers,
  productUnits,
  quoteSelectedAssemblies,
  quotes,
  quoteWorkItemParts,
  quoteWorkItems,
  supplier,
} from '@pkg/db/equipment';
import { DateOnlyIso, UUID } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { getJobMaterialVariance } from '../inventory/job-variance-read.js';
import { postAdjustment, postJobMovement } from '../inventory/stock-movement-service.js';
import { createTester } from '../test/create-tester.js';
import { partValues } from '../test/part-fixtures.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { listCompletedJobSales } from './job-sales-export.js';

const ACTOR_USER_ID = 'sales-export-test-user';
const NO_FILTERS = { columnFilters: {}, search: '' } as const;

const test = createTester(async ({ db }) => seedSalesShape(db));

describe('listCompletedJobSales', () => {
  test('puts the ledger cost beside the Quote price on one line per completed Job', async ({ context }) => {
    const rows = await listCompletedJobSales({ db: context.db, input: NO_FILTERS });

    expect(rows).toEqual([
      // The Stock Build sold to nobody: a machine we still hold, with no Quote to price it.
      expect.objectContaining({
        completedOn: '2026-07-10',
        customerCompanyName: null,
        invoiceNumber: null,
        productSerialNumber: 'SR-100260002',
        quoteCode: null,
        retailExVat: null,
        retailIncVat: null,
      }),
      expect.objectContaining({
        completedOn: '2026-07-15',
        // 6 drawn at 10 with 2 handed back: the Job is holding 4 units of stamped cost.
        costExVat: 40,
        costIncVat: 46,
        customerCompanyName: 'Riverside Farm',
        invoiceNumber: 'INV-2026-0044',
        jobCode: expect.stringMatching(/^JOB-\d{5}$/),
        productModelCode: 'SR-100',
        productName: 'Silage Trailer',
        productSerialNumber: 'SR-100260001',
        // Base 100 000 plus a 5 000 assembly, less 10%.
        retailExVat: 94_500,
        retailIncVat: 108_675,
      }),
      expect.objectContaining({
        completedOn: '2026-07-20',
        // A Custom Job builds no machine, so it has neither serial nor Product.
        customerCompanyName: 'Hilltop Transport',
        productModelCode: null,
        productName: null,
        productSerialNumber: null,
        // Two hours at 500 plus two parts at 250.
        retailExVat: 1_500,
        retailIncVat: 1_725,
      }),
    ]);
  });

  test('leaves the cost empty rather than short when the Job holds material nobody has priced', async ({ context }) => {
    const rows = await listCompletedJobSales({ db: context.db, input: NO_FILTERS });
    const custom = rows.find((row) => row.completedOn === '2026-07-20');

    expect(custom).toMatchObject({ costExVat: null, costIncVat: null });
  });

  test('costs a Job that drew nothing at zero, which is not the same as unpriced', async ({ context }) => {
    const rows = await listCompletedJobSales({ db: context.db, input: NO_FILTERS });
    const stockBuild = rows.find((row) => row.completedOn === '2026-07-10');

    expect(stockBuild).toMatchObject({ costExVat: 0, costIncVat: 0 });
  });

  /**
   * The unpriced test is per Part, not per Job. A return against an empty pool is stamped null and
   * carries a *positive* delta, so on a whole-Job net it cancels an unpriced draw on some unrelated
   * Part — and the Job would report a costed total while material nobody has priced rode along free.
   */
  test('does not let one Part null-stamped return cancel another Part unpriced draw', async ({ context }) => {
    // Empty the costed Part's pool (4 still out), then over-return one more: nothing is left to
    // reverse, so that row is stamped null with a positive delta.
    for (const quantity of [4, 1]) {
      await postJobMovement({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: { jobId: context.jobs.build, lengthMm: null, partId: context.parts.costed, quantity },
        movementType: 'return-to-store',
      });
    }
    await postJobMovement({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: { jobId: context.jobs.build, lengthMm: null, partId: context.parts.unpriced, quantity: 1 },
      movementType: 'checkout',
    });

    const rows = await listCompletedJobSales({ db: context.db, input: NO_FILTERS });
    const build = rows.find((row) => row.completedOn === '2026-07-15');

    expect(build).toMatchObject({ costExVat: null, costIncVat: null });
    // The invariant the shared expressions exist for: both reads call this Job unpriced, or neither.
    await expect(
      getJobMaterialVariance({ db: context.db, jobId: UUID.parse(context.jobs.build) }),
    ).resolves.toMatchObject({ totalActualCost: null });
  });

  test('reports completed Jobs only, and never a Cancelled one', async ({ context }) => {
    const rows = await listCompletedJobSales({ db: context.db, input: NO_FILTERS });

    expect(rows.map((row) => row.completedOn)).toEqual(['2026-07-10', '2026-07-15', '2026-07-20']);
  });

  test('narrows to the completion dates asked for', async ({ context }) => {
    const rows = await listCompletedJobSales({
      db: context.db,
      input: {
        columnFilters: {
          completedOnEnd: DateOnlyIso.parse('2026-07-16'),
          completedOnStart: DateOnlyIso.parse('2026-07-12'),
        },
        search: '',
      },
    });

    expect(rows.map((row) => row.completedOn)).toEqual(['2026-07-15']);
  });

  test('filters by Customer the way the Job List does, following the machine to its Owner', async ({ context }) => {
    const rows = await listCompletedJobSales({
      db: context.db,
      input: { columnFilters: { customerId: UUID.parse(context.customers.riverside) }, search: '' },
    });

    expect(rows.map((row) => row.customerCompanyName)).toEqual(['Riverside Farm']);
  });
});

/**
 * One of every completed shape the report has to answer for — a sold build, a Custom Job, a Stock
 * Build nobody owns — plus the two it must leave out: open work and a Cancelled Job.
 */
async function seedSalesShape(db: Db) {
  const now = new Date('2026-05-01T08:00:00.000Z');

  await db.insert(user).values({
    createdAt: now,
    email: 'sales-export@example.com',
    emailVerified: true,
    id: ACTOR_USER_ID,
    name: 'Sales Export Tester',
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

  const [tipper] = await db
    .insert(productAssemblies)
    .values([{ displayOrder: 0, kind: 'optional', name: 'Hydraulic tipper', price: 5_000, productId: product.id }])
    .returning();
  if (!tipper) throw new Error('Product assembly insert did not return a row');

  const [riverside, hilltop] = await db
    .insert(customers)
    .values([{ companyName: 'Riverside Farm' }, { companyName: 'Hilltop Transport' }])
    .returning();
  if (!riverside || !hilltop) throw new Error('Customer inserts did not return every row');

  const [soldUnit, stockUnit, openUnit] = await db
    .insert(productUnits)
    .values(
      ['SR-100260001', 'SR-100260002', 'SR-100260003'].map((serial, index) => ({
        productId: product.id,
        productSerialNumber: serial,
        productSerialPrefix: 'SR-100',
        productSerialSequence: index + 1,
        productSerialYear: 26,
      })),
    )
    .returning();
  if (!soldUnit || !stockUnit || !openUnit) throw new Error('Product Unit inserts did not return every row');

  await db.insert(productUnitOwnershipTransfers).values({
    actorUserId: ACTOR_USER_ID,
    occurredOn: '2026-06-01',
    productUnitId: soldUnit.id,
    toCustomerId: riverside.id,
  });

  const [buildQuote, customQuote, cancelledQuote] = await db
    .insert(quotes)
    .values([
      {
        customerId: riverside.id,
        discountPercent: 10,
        invoiceNumber: 'INV-2026-0044',
        productId: product.id,
        quotedBasePrice: 100_000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: 'accepted',
      },
      {
        customerId: hilltop.id,
        kind: 'custom',
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: 'accepted',
        workTitle: 'Chassis repair',
      },
      {
        customerId: hilltop.id,
        kind: 'custom',
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        cancellationReason: 'Customer withdrew',
        salesPersonId: ACTOR_USER_ID,
        status: 'cancelled',
        workTitle: 'Abandoned rebuild',
      },
    ])
    .returning();
  if (!buildQuote || !customQuote || !cancelledQuote) throw new Error('Quote inserts did not return every row');

  await db.insert(quoteSelectedAssemblies).values({
    productAssemblyId: tipper.id,
    quotedName: 'Hydraulic tipper',
    quotedPrice: 5_000,
    quoteId: buildQuote.id,
  });

  const [workItem] = await db
    .insert(quoteWorkItems)
    .values({ department: 'fabrication', hourlyRate: 500, hours: 2, quoteId: customQuote.id })
    .returning();
  if (!workItem) throw new Error('Work Item insert did not return a row');

  await db
    .insert(quoteWorkItemParts)
    .values({ name: 'Crossmember', quantity: 2, unitPrice: 250, workItemId: workItem.id });

  const [buildJob, customJob, stockBuildJob, openJob, cancelledJob] = await db
    .insert(jobs)
    .values([
      { productUnitId: soldUnit.id, quoteId: buildQuote.id },
      { quoteId: customQuote.id },
      { productUnitId: stockUnit.id },
      { productUnitId: openUnit.id },
      { cancelledAt: now, quoteId: cancelledQuote.id },
    ])
    .returning();
  if (!buildJob || !customJob || !stockBuildJob || !openJob || !cancelledJob) {
    throw new Error('Job inserts did not return every row');
  }

  const [createdSupplier] = await db
    .insert(supplier)
    .values({ companyName: 'Sales Export Supplier' })
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
    input: {
      delta: 10,
      lengthMm: null,
      note: null,
      partId: costedPart.id,
      reason: 'opening-balance',
      unitCost: 10,
    },
  });
  await postJobMovement({
    actorUserId: ACTOR_USER_ID,
    db,
    input: { jobId: buildJob.id, lengthMm: null, partId: costedPart.id, quantity: 6 },
    movementType: 'checkout',
  });
  await postJobMovement({
    actorUserId: ACTOR_USER_ID,
    db,
    input: { jobId: buildJob.id, lengthMm: null, partId: costedPart.id, quantity: 2 },
    movementType: 'return-to-store',
  });

  // Stock that arrived with no cost against it: the Custom Job's draw is stamped null, which is what
  // makes its total unknowable rather than merely small.
  await postAdjustment({
    actorUserId: ACTOR_USER_ID,
    db,
    input: {
      delta: 5,
      lengthMm: null,
      note: null,
      partId: unpricedPart.id,
      reason: 'opening-balance',
      unitCost: null,
    },
  });
  await postJobMovement({
    actorUserId: ACTOR_USER_ID,
    db,
    input: { jobId: customJob.id, lengthMm: null, partId: unpricedPart.id, quantity: 3 },
    movementType: 'checkout',
  });

  // Completion is stamped after the draws so the movements post against live Jobs.
  await db.update(jobs).set({ completedOn: '2026-07-15' }).where(eq(jobs.id, buildJob.id));
  await db.update(jobs).set({ completedOn: '2026-07-20' }).where(eq(jobs.id, customJob.id));
  await db.update(jobs).set({ completedOn: '2026-07-10' }).where(eq(jobs.id, stockBuildJob.id));
  await db.update(jobs).set({ completedOn: '2026-07-18' }).where(eq(jobs.id, cancelledJob.id));

  return {
    customers: { hilltop: hilltop.id, riverside: riverside.id },
    jobs: { build: buildJob.id },
    parts: { costed: costedPart.id, unpriced: unpricedPart.id },
  };
}
