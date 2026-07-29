import {
  customers,
  type Db,
  documents,
  feedback,
  jobBays,
  jobCfoAssemblies,
  jobCfoParts,
  jobSlots,
  jobs,
  parts,
  products,
  productUnitOwnershipTransfers,
  productUnits,
  quotes,
  readMigrationStatements,
  supplier,
  user,
} from '@pkg/db';
import { isProductUnitInStock, resolveProductUnitOwnerId } from '@pkg/domain';
import { asc, eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';

// The placeholder Customer to retire — the id Dean supplied on 2026-07-28, the same one #1010's
// backfill left unowned. Matched by id on purpose: "Stock" is an editable company name.
const STOCK_CUSTOMER_ID = '5c32124d-9b97-49f9-8529-3d5d4679c392';
const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000b1';
const SHOWROOM_JOB_ID = '00000000-0000-4000-8000-000000000201';
const BACKFILLED_JOB_ID = '00000000-0000-4000-8000-000000000202';
const SOLD_JOB_ID = '00000000-0000-4000-8000-000000000203';
const DECOY_JOB_ID = '00000000-0000-4000-8000-000000000204';

const test = createTester(async ({ db }) => ({ db, seed: await seedPlaceholderShape(db) }));

async function runMigration(db: Db, tag: string): Promise<void> {
  for (const statement of readMigrationStatements(tag)) {
    await db.execute(sql.raw(statement));
  }
}

async function runCleanup(db: Db): Promise<void> {
  return runMigration(db, '0096_retire_stock_customer');
}

describe('stock customer retirement', () => {
  // Without this the suite passes on a typo'd id: the fixture and the SQL would share one wrong
  // constant, and the migration would quietly delete nothing — or the wrong Customer.
  test('targets the Stock Customer id that was actually supplied', () => {
    expect(readMigrationStatements('0096_retire_stock_customer').join('\n')).toContain(STOCK_CUSTOMER_ID);
    // The backfill deliberately left this Customer's machines unowned; both steps must mean the same row.
    expect(readMigrationStatements('0088_product_unit_backfill').join('\n')).toContain(STOCK_CUSTOMER_ID);
  });

  test('leaves the showroom machines unowned', async ({ context }) => {
    await runCleanup(context.db);

    const showroomTransfers = await transfersForSerial(context.db, 'SC-001260001');
    const backfilledTransfers = await transfersForSerial(context.db, 'SC-001260002');

    expect(showroomTransfers).toEqual([]);
    expect(isProductUnitInStock(showroomTransfers)).toBe(true);
    expect(backfilledTransfers).toEqual([]);
    expect(isProductUnitInStock(backfilledTransfers)).toBe(true);
  });

  test('turns the placeholder builds into Stock Builds', async ({ context }) => {
    await runCleanup(context.db);

    const jobRows = await context.db.select().from(jobs).orderBy(asc(jobs.code));
    const [showroomJob, backfilledJob, soldJob] = jobRows;

    expect(showroomJob).toMatchObject({ id: SHOWROOM_JOB_ID, quoteId: null });
    expect(showroomJob?.productUnitId).not.toBeNull();
    expect(backfilledJob).toMatchObject({ id: BACKFILLED_JOB_ID, quoteId: null });
    expect(backfilledJob?.productUnitId).not.toBeNull();
    expect(soldJob).toMatchObject({ id: SOLD_JOB_ID, quoteId: context.seed.soldQuoteId });
  });

  test('deletes the placeholder Quotes and leaves every real one', async ({ context }) => {
    await runCleanup(context.db);

    const quoteRows = await context.db.select().from(quotes).orderBy(asc(quotes.code));

    expect(quoteRows.map((quote) => quote.id)).toEqual([context.seed.soldQuoteId, context.seed.decoyQuoteId]);
  });

  test('removes the placeholder Customer', async ({ context }) => {
    await runCleanup(context.db);

    const customerRows = await context.db.select().from(customers).orderBy(asc(customers.createdAt));

    expect(customerRows.map((customer) => customer.id)).not.toContain(STOCK_CUSTOMER_ID);
  });

  // A real Customer that happens to be called "Stock" is still a real Customer. This fails the moment
  // anyone reaches for a name match instead of the supplied id.
  test('leaves a real Customer that is also called Stock alone', async ({ context }) => {
    await runCleanup(context.db);

    const [decoy] = await context.db.select().from(customers).where(eq(customers.id, context.seed.decoyCustomerId));
    const decoyTransfers = await transfersForSerial(context.db, 'SC-001260004');

    expect(decoy?.companyName).toBe('Stock');
    expect(resolveProductUnitOwnerId(decoyTransfers)).toBe(context.seed.decoyCustomerId);
  });

  test('leaves the machines they built untouched', async ({ context }) => {
    const before = await readBuildRecord(context.db);

    await runCleanup(context.db);

    expect(await readBuildRecord(context.db)).toEqual(before);
  });

  test('changes nothing when it runs again', async ({ context }) => {
    await runCleanup(context.db);
    const afterFirstRun = await readRetiredShape(context.db);

    await runCleanup(context.db);

    expect(await readRetiredShape(context.db)).toEqual(afterFirstRun);
  });

  // Deleting a Quote cascades to its paperwork. The epic confirmed there is none, so anything found
  // here is a fact nobody knew about — the run stops rather than shredding it.
  test('refuses to run while a placeholder Quote still carries a Document', async ({ context }) => {
    await context.db.insert(documents).values({
      byteSize: 2_048,
      contentType: 'application/pdf',
      filename: 'quote.pdf',
      metadata: { revision: 1 },
      ownerType: 'quote',
      quoteId: context.seed.showroomQuoteId,
      storageKey: 'quotes/placeholder/quote.pdf',
      uploaderUserId: ACTOR_USER_ID,
    });

    await expect(runCleanup(context.db)).rejects.toThrow(/attached/i);

    const remaining = await context.db.select().from(customers).where(eq(customers.id, STOCK_CUSTOMER_ID));
    expect(remaining).toHaveLength(1);
  });

  test('refuses to run while a placeholder Quote still carries Feedback', async ({ context }) => {
    await context.db.insert(feedback).values({
      kind: 'general',
      quoteId: context.seed.showroomQuoteId,
      subjectType: 'quote',
      submitterId: ACTOR_USER_ID,
      text: 'Someone had something to say about this after all.',
    });

    await expect(runCleanup(context.db)).rejects.toThrow(/attached/i);

    const remaining = await context.db.select().from(customers).where(eq(customers.id, STOCK_CUSTOMER_ID));
    expect(remaining).toHaveLength(1);
  });
});

async function transfersForSerial(db: Db, serial: string) {
  const [unit] = await db.select().from(productUnits).where(eq(productUnits.productSerialNumber, serial));

  return db
    .select()
    .from(productUnitOwnershipTransfers)
    .where(eq(productUnitOwnershipTransfers.productUnitId, unit?.id ?? ''));
}

/** The facts the fiction was hiding: the machine, its CFO, its paperwork, its schedule, its finish date. */
async function readBuildRecord(db: Db) {
  const [unitRows, cfoAssemblyRows, cfoPartRows, documentRows, slotRows, jobRows] = await Promise.all([
    db.select().from(productUnits).orderBy(asc(productUnits.productSerialNumber)),
    db.select().from(jobCfoAssemblies).orderBy(asc(jobCfoAssemblies.id)),
    db.select().from(jobCfoParts).orderBy(asc(jobCfoParts.partId)),
    db.select().from(documents).orderBy(asc(documents.id)),
    db.select().from(jobSlots).orderBy(asc(jobSlots.sequence)),
    db
      .select({ code: jobs.code, completedOn: jobs.completedOn, productUnitId: jobs.productUnitId })
      .from(jobs)
      .orderBy(asc(jobs.code)),
  ]);

  return { cfoAssemblyRows, cfoPartRows, documentRows, jobRows, slotRows, unitRows };
}

/** Full rows, not counts: a re-run that rewrote a Job link or resurrected a Quote must fail too. */
async function readRetiredShape(db: Db) {
  const [customerRows, quoteRows, transferRows, jobRows] = await Promise.all([
    db.select().from(customers).orderBy(asc(customers.id)),
    db.select().from(quotes).orderBy(asc(quotes.code)),
    db.select().from(productUnitOwnershipTransfers).orderBy(asc(productUnitOwnershipTransfers.id)),
    db.select().from(jobs).orderBy(asc(jobs.code)),
  ]);

  return { customerRows, jobRows, quoteRows, transferRows };
}

/**
 * Production as the cleanup will find it: showroom machines raised against the placeholder Customer,
 * one of them backfilled by #1010 (no transfers) and one built after it landed through the live writer
 * (a transfer to the placeholder), alongside a genuinely sold machine and a real Customer named Stock.
 */
async function seedPlaceholderShape(db: Db) {
  const now = new Date('2026-06-01T08:00:00.000Z');

  await db.insert(user).values({
    createdAt: now,
    email: 'retirement@example.com',
    emailVerified: true,
    id: ACTOR_USER_ID,
    name: 'Retirement Test User',
    role: 'sales',
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
      modelCode: 'SC-001',
      name: 'Stock Cleanup Test Product',
      rangeId,
    })
    .returning();
  if (!product) throw new Error('Product insert did not return a row');

  await db.insert(customers).values({ companyName: 'Stock', email: null, id: STOCK_CUSTOMER_ID });

  const [realCustomer] = await db.insert(customers).values({ companyName: 'Riverside Farm', email: null }).returning();
  if (!realCustomer) throw new Error('Customer insert did not return a row');

  // A genuine Customer that shares the placeholder's name. Nothing may treat it as the placeholder.
  const [decoyCustomer] = await db.insert(customers).values({ companyName: 'Stock', email: null }).returning();
  if (!decoyCustomer) throw new Error('Decoy customer insert did not return a row');

  const [showroomUnit, backfilledUnit, soldUnit, decoyUnit] = await db
    .insert(productUnits)
    .values(
      ['SC-001260001', 'SC-001260002', 'SC-001260003', 'SC-001260004'].map((serial, index) => ({
        productId: product.id,
        productSerialNumber: serial,
        productSerialPrefix: 'SC-001',
        productSerialSequence: index + 1,
        productSerialYear: 26,
        vinNumber: null,
      })),
    )
    .returning();
  if (!showroomUnit || !backfilledUnit || !soldUnit || !decoyUnit) {
    throw new Error('Product Unit insert did not return every row');
  }

  const [showroomQuote, backfilledQuote, soldQuote, decoyQuote] = await db
    .insert(quotes)
    .values([
      {
        customerId: STOCK_CUSTOMER_ID,
        productId: product.id,
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: 'accepted',
      },
      {
        customerId: STOCK_CUSTOMER_ID,
        productId: product.id,
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: 'accepted',
      },
      {
        customerId: realCustomer.id,
        productId: product.id,
        quotedBasePrice: 1_000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: 'accepted',
      },
      {
        customerId: decoyCustomer.id,
        productId: product.id,
        quotedBasePrice: 1_000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: 'accepted',
      },
    ])
    .returning();
  if (!showroomQuote || !backfilledQuote || !soldQuote || !decoyQuote) {
    throw new Error('Quote insert did not return every row');
  }

  await db.insert(jobs).values([
    {
      completedOn: '2026-06-12',
      createdAt: now,
      id: SHOWROOM_JOB_ID,
      productUnitId: showroomUnit.id,
      quoteId: showroomQuote.id,
      updatedAt: now,
    },
    {
      completedOn: '2026-06-14',
      createdAt: now,
      id: BACKFILLED_JOB_ID,
      productUnitId: backfilledUnit.id,
      quoteId: backfilledQuote.id,
      updatedAt: now,
    },
    { createdAt: now, id: SOLD_JOB_ID, productUnitId: soldUnit.id, quoteId: soldQuote.id, updatedAt: now },
    { createdAt: now, id: DECOY_JOB_ID, productUnitId: decoyUnit.id, quoteId: decoyQuote.id, updatedAt: now },
  ]);

  await db.insert(productUnitOwnershipTransfers).values([
    // Written by the live writer between #1010 and this cleanup: the fiction, recorded as ownership.
    {
      occurredOn: '2026-06-01',
      productUnitId: showroomUnit.id,
      sourceQuoteId: showroomQuote.id,
      toCustomerId: STOCK_CUSTOMER_ID,
    },
    {
      occurredOn: '2026-06-01',
      productUnitId: soldUnit.id,
      sourceQuoteId: soldQuote.id,
      toCustomerId: realCustomer.id,
    },
    {
      occurredOn: '2026-06-01',
      productUnitId: decoyUnit.id,
      sourceQuoteId: decoyQuote.id,
      toCustomerId: decoyCustomer.id,
    },
  ]);

  const [createdSupplier] = await db
    .insert(supplier)
    .values({ companyName: 'Parts Supplier', email: null })
    .returning();
  if (!createdSupplier) throw new Error('Supplier insert did not return a row');

  const [part] = await db
    .insert(parts)
    .values({
      category: 'Fabrication',
      code: 'PART-CHASSIS',
      description: 'Chassis Plate',
      finish: 'Raw',
      name: 'Chassis Plate',
      supplierCode: 'PART-CHASSIS',
      supplierId: createdSupplier.id,
      unitOfMeasure: 'quantity',
    })
    .returning();
  if (!part) throw new Error('Part insert did not return a row');

  const [cfoAssembly] = await db
    .insert(jobCfoAssemblies)
    .values({ assemblyName: 'Standard Chassis', jobId: SHOWROOM_JOB_ID, kind: 'standard', sequence: 0 })
    .returning();
  if (!cfoAssembly) throw new Error('CFO assembly insert did not return a row');

  await db.insert(jobCfoParts).values({ cfoAssemblyId: cfoAssembly.id, partId: part.id, quantity: 2 });

  const [bay] = await db
    .insert(jobBays)
    .values({ department: 'fabrication', name: 'Fab 1', scheduleOrigin: '2026-06-01' })
    .returning();
  if (!bay) throw new Error('Bay insert did not return a row');

  await db.insert(jobSlots).values({
    bayId: bay.id,
    durationDays: 3,
    jobId: SHOWROOM_JOB_ID,
    kind: 'work',
    sequence: 1,
  });

  await db.insert(documents).values({
    byteSize: 1_024,
    contentType: 'application/pdf',
    filename: 'brochure.pdf',
    jobId: SHOWROOM_JOB_ID,
    metadata: { type: 'brochure' },
    ownerType: 'job',
    storageKey: 'jobs/showroom/brochure.pdf',
    uploaderUserId: ACTOR_USER_ID,
  });

  return {
    backfilledQuoteId: backfilledQuote.id,
    decoyCustomerId: decoyCustomer.id,
    decoyQuoteId: decoyQuote.id,
    realCustomerId: realCustomer.id,
    showroomQuoteId: showroomQuote.id,
    soldQuoteId: soldQuote.id,
  };
}
