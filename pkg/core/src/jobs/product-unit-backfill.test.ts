import {
  customers,
  type Db,
  documents,
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

// The placeholder Customer the backfill must leave unowned. Matched by id, never by name.
const STOCK_CUSTOMER_ID = '5c32124d-9b97-49f9-8529-3d5d4679c392';
const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000a1';
const SOLD_JOB_ID = '00000000-0000-4000-8000-000000000101';
const STOCK_JOB_ID = '00000000-0000-4000-8000-000000000102';
const CUSTOM_JOB_ID = '00000000-0000-4000-8000-000000000103';
// 00:30 the next morning in Africa/Johannesburg: proves the transfer date is a plant business date.
const SOLD_JOB_CREATED_AT = new Date('2026-05-01T22:30:00.000Z');

const test = createTester(async ({ db }) => ({ db, seed: await seedPreMigrationShape(db) }));

async function runBackfill(db: Db): Promise<void> {
  for (const statement of readMigrationStatements('0088_product_unit_backfill')) {
    await db.execute(sql.raw(statement));
  }
}

describe('product unit backfill', () => {
  test('extracts one Product Unit per serialled Job and binds the Job to it', async ({ context }) => {
    await runBackfill(context.db);

    const unitRows = await context.db.select().from(productUnits).orderBy(asc(productUnits.productSerialNumber));
    const jobRows = await context.db.select().from(jobs).orderBy(asc(jobs.code));

    expect(unitRows).toHaveLength(2);
    expect(unitRows[0]).toMatchObject({
      productId: context.seed.productId,
      productSerialNumber: 'BF-001260001',
      productSerialPrefix: 'BF-001',
      productSerialSequence: 1,
      productSerialYear: 26,
      vinNumber: 'VIN-RIVERSIDE-1',
    });
    expect(unitRows[1]).toMatchObject({ productSerialNumber: 'BF-001260002', vinNumber: null });

    const [soldJob, stockJob, customJob] = jobRows;
    expect(soldJob?.productUnitId).toBe(unitRows[0]?.id);
    expect(stockJob?.productUnitId).toBe(unitRows[1]?.id);
    expect(customJob?.productUnitId).toBeNull();
  });

  test('records who each sold machine was built for, as a plant business date', async ({ context }) => {
    await runBackfill(context.db);

    const transfers = await context.db.select().from(productUnitOwnershipTransfers);
    const [unit] = await context.db
      .select()
      .from(productUnits)
      .where(eq(productUnits.productSerialNumber, 'BF-001260001'));

    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({
      // Null actor: the system wrote this row, not a person.
      actorUserId: null,
      fromCustomerId: null,
      note: null,
      occurredOn: '2026-05-02',
      productUnitId: unit?.id,
      sourceQuoteId: context.seed.soldQuoteId,
      toCustomerId: context.seed.customerId,
    });
    expect(resolveProductUnitOwnerId(transfers)).toBe(context.seed.customerId);
  });

  test('leaves machines built against the Stock Customer unowned', async ({ context }) => {
    await runBackfill(context.db);

    const [stockUnit] = await context.db
      .select()
      .from(productUnits)
      .where(eq(productUnits.productSerialNumber, 'BF-001260002'));
    const stockTransfers = await context.db
      .select()
      .from(productUnitOwnershipTransfers)
      .where(eq(productUnitOwnershipTransfers.productUnitId, stockUnit?.id ?? ''));

    expect(stockTransfers).toEqual([]);
    expect(isProductUnitInStock(stockTransfers)).toBe(true);
  });

  test('leaves the build record itself untouched', async ({ context }) => {
    const before = await readBuildRecord(context.db);

    await runBackfill(context.db);

    expect(await readBuildRecord(context.db)).toEqual(before);
  });

  test('inserts nothing new when it runs again', async ({ context }) => {
    await runBackfill(context.db);
    const afterFirstRun = await readCounts(context.db);

    await runBackfill(context.db);

    expect(await readCounts(context.db)).toEqual(afterFirstRun);
  });
});

async function readCounts(db: Db) {
  const [unitRows, transferRows] = await Promise.all([
    db.select().from(productUnits),
    db.select().from(productUnitOwnershipTransfers),
  ]);

  return { transfers: transferRows.length, units: unitRows.length };
}

/** The facts a botched backfill would take with it: the CFO, the paperwork, the schedule, the date it finished. */
async function readBuildRecord(db: Db) {
  // Ordered explicitly: the backfill's UPDATE rewrites Job rows, which changes their physical order.
  const [cfoAssemblyRows, cfoPartRows, documentRows, slotRows, jobRows] = await Promise.all([
    db.select().from(jobCfoAssemblies).orderBy(asc(jobCfoAssemblies.id)),
    db.select().from(jobCfoParts).orderBy(asc(jobCfoParts.partId)),
    db.select().from(documents).orderBy(asc(documents.id)),
    db.select().from(jobSlots).orderBy(asc(jobSlots.sequence)),
    db
      .select({ code: jobs.code, completedOn: jobs.completedOn, serial: jobs.productSerialNumber })
      .from(jobs)
      .orderBy(asc(jobs.code)),
  ]);

  return { cfoAssemblyRows, cfoPartRows, documentRows, jobRows, slotRows };
}

async function seedPreMigrationShape(db: Db) {
  const now = new Date('2026-05-01T08:00:00.000Z');

  await db.insert(user).values({
    createdAt: now,
    email: 'backfill@example.com',
    emailVerified: true,
    id: ACTOR_USER_ID,
    name: 'Backfill Test User',
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
      modelCode: 'BF-001',
      name: 'Backfill Test Product',
      rangeId,
    })
    .returning();
  if (!product) throw new Error('Product insert did not return a row');

  const [customer] = await db.insert(customers).values({ companyName: 'Riverside Farm', email: null }).returning();
  if (!customer) throw new Error('Customer insert did not return a row');

  await db.insert(customers).values({ companyName: 'Stock', email: null, id: STOCK_CUSTOMER_ID });

  const [soldQuote, stockQuote, customQuote] = await db
    .insert(quotes)
    .values([
      {
        customerId: customer.id,
        productId: product.id,
        quotedBasePrice: 1_000,
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
        customerId: customer.id,
        kind: 'custom',
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: 'accepted',
        workTitle: 'Pump skid rebuild',
      },
    ])
    .returning();
  if (!soldQuote || !stockQuote || !customQuote) throw new Error('Quote insert did not return every row');

  // Jobs are written in the pre-migration shape: the serial lives on the Job and no Unit exists yet.
  await db.insert(jobs).values([
    {
      completedOn: '2026-05-04',
      createdAt: SOLD_JOB_CREATED_AT,
      id: SOLD_JOB_ID,
      productId: product.id,
      productSerialNumber: 'BF-001260001',
      productSerialPrefix: 'BF-001',
      productSerialSequence: 1,
      productSerialYear: 26,
      quoteId: soldQuote.id,
      updatedAt: SOLD_JOB_CREATED_AT,
      vinNumber: 'VIN-RIVERSIDE-1',
    },
    {
      createdAt: now,
      id: STOCK_JOB_ID,
      productId: product.id,
      productSerialNumber: 'BF-001260002',
      productSerialPrefix: 'BF-001',
      productSerialSequence: 2,
      productSerialYear: 26,
      quoteId: stockQuote.id,
      updatedAt: now,
    },
    { createdAt: now, id: CUSTOM_JOB_ID, quoteId: customQuote.id, updatedAt: now },
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
    .values({ assemblyName: 'Standard Chassis', jobId: SOLD_JOB_ID, kind: 'standard', sequence: 0 })
    .returning();
  if (!cfoAssembly) throw new Error('CFO assembly insert did not return a row');

  await db.insert(jobCfoParts).values({ cfoAssemblyId: cfoAssembly.id, partId: part.id, quantity: 2 });

  const [bay] = await db
    .insert(jobBays)
    .values({ department: 'fabrication', name: 'Fab 1', scheduleOrigin: '2026-05-01' })
    .returning();
  if (!bay) throw new Error('Bay insert did not return a row');

  await db.insert(jobSlots).values({
    bayId: bay.id,
    durationDays: 3,
    jobId: SOLD_JOB_ID,
    kind: 'work',
    sequence: 1,
  });

  await db.insert(documents).values({
    byteSize: 1_024,
    contentType: 'application/pdf',
    filename: 'purchase-order.pdf',
    jobId: SOLD_JOB_ID,
    metadata: { type: 'purchase_order' },
    ownerType: 'job',
    storageKey: 'jobs/backfill/purchase-order.pdf',
    uploaderUserId: ACTOR_USER_ID,
  });

  return {
    customerId: customer.id,
    productId: product.id,
    soldQuoteId: soldQuote.id,
  };
}
