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

// The placeholder Customer the backfill must leave unowned — the id Dean supplied on 2026-07-28.
const STOCK_CUSTOMER_ID = '5c32124d-9b97-49f9-8529-3d5d4679c392';
const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000a1';
const SOLD_JOB_ID = '00000000-0000-4000-8000-000000000101';
const STOCK_JOB_ID = '00000000-0000-4000-8000-000000000102';
const CUSTOM_JOB_ID = '00000000-0000-4000-8000-000000000103';
const DECOY_JOB_ID = '00000000-0000-4000-8000-000000000104';
// 00:30 the next morning in Africa/Johannesburg: proves the transfer date is a plant business date.
const SOLD_JOB_CREATED_AT = new Date('2026-05-01T22:30:00.000Z');

const test = createTester(async ({ db }) => {
  await restorePreMigrationJobColumns(db);

  return { db, seed: await seedPreMigrationShape(db) };
});

async function runMigration(db: Db, tag: string): Promise<void> {
  for (const statement of readMigrationStatements(tag)) {
    await db.execute(sql.raw(statement));
  }
}

async function runBackfill(db: Db): Promise<void> {
  return runMigration(db, '0088_product_unit_backfill');
}

/**
 * Puts the identity columns back on `job` so the backfill has something to read. The template database
 * has every migration applied, including the one that drops them, but the backfill still runs against
 * the pre-drop shape on the way through — this test is the only thing standing between that one
 * production run and a machine losing its serial, so it recreates the shape rather than skipping it.
 */
async function restorePreMigrationJobColumns(db: Db): Promise<void> {
  await db.execute(sql`
    alter table "job"
      add column "product_id" uuid,
      add column "product_serial_prefix" text,
      add column "product_serial_year" integer,
      add column "product_serial_sequence" integer,
      add column "product_serial_number" text,
      add column "vin_number" text
  `);
  // Constraint names match the pre-drop schema exactly, so the drop migration can be run over this.
  await db.execute(sql`
    alter table "job"
      add constraint "job_product_id_products_id_fk" foreign key ("product_id") references "products"("id"),
      add constraint "job_product_serial_prefix_nonempty" check (length(trim("product_serial_prefix")) > 0),
      add constraint "job_product_serial_year_range" check ("product_serial_year" >= 0 and "product_serial_year" <= 99),
      add constraint "job_product_serial_sequence_positive" check ("product_serial_sequence" > 0),
      add constraint "job_product_serial_number_nonempty" check (length(trim("product_serial_number")) > 0),
      add constraint "job_product_serial_shape" check (
        ("product_id" is not null
          and "product_serial_number" is not null
          and "product_serial_prefix" is not null
          and "product_serial_year" is not null
          and "product_serial_sequence" is not null)
        or ("product_id" is null
          and "product_serial_number" is null
          and "product_serial_prefix" is null
          and "product_serial_year" is null
          and "product_serial_sequence" is null)
      )
  `);
  await db.execute(sql`create unique index "job_product_serial_number_unique" on "job" ("product_serial_number")`);
}

/** The identity a Job carried before the extraction: written straight to the restored columns. */
async function setPreMigrationIdentity(
  db: Db,
  jobId: string,
  identity: { productId: string; sequence: number; serial: string; vin?: string },
): Promise<void> {
  await db.execute(sql`
    update "job"
    set "product_id" = ${identity.productId},
        "product_serial_prefix" = 'BF-001',
        "product_serial_year" = 26,
        "product_serial_sequence" = ${identity.sequence},
        "product_serial_number" = ${identity.serial},
        "vin_number" = ${identity.vin ?? null}
    where "id" = ${jobId}
  `);
}

describe('product unit backfill', () => {
  // Without this the suite passes on a typo'd id: the fixture and the SQL would simply share one
  // wrong constant, and the machines meant to stay in Stock would be backfilled as owned.
  test('excludes the Stock Customer id that was actually supplied', () => {
    expect(readMigrationStatements('0088_product_unit_backfill').join('\n')).toContain(STOCK_CUSTOMER_ID);
  });

  test('extracts one Product Unit per serialled Job and binds the Job to it', async ({ context }) => {
    await runBackfill(context.db);

    const unitRows = await context.db.select().from(productUnits).orderBy(asc(productUnits.productSerialNumber));
    const jobRows = await context.db.select().from(jobs).orderBy(asc(jobs.code));

    expect(unitRows).toHaveLength(3);
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

    const transfers = await transfersForSerial(context.db, 'BF-001260001');
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

    const stockTransfers = await transfersForSerial(context.db, 'BF-001260002');

    expect(stockTransfers).toEqual([]);
    expect(isProductUnitInStock(stockTransfers)).toBe(true);
  });

  // A real Customer that happens to be called "Stock" is still a real Customer. This fails the moment
  // anyone reaches for a name match instead of the supplied id.
  test('owns a machine built for a different Customer that is also called Stock', async ({ context }) => {
    await runBackfill(context.db);

    const decoyTransfers = await transfersForSerial(context.db, 'BF-001260003');

    expect(decoyTransfers).toHaveLength(1);
    expect(resolveProductUnitOwnerId(decoyTransfers)).toBe(context.seed.decoyCustomerId);
  });

  test('leaves the build record itself untouched', async ({ context }) => {
    const before = await readBuildRecord(context.db);

    await runBackfill(context.db);

    expect(await readBuildRecord(context.db)).toEqual(before);
  });

  // The whole point of the extraction: the machine's identity outlives the columns it was born in.
  test('leaves every Unit intact once the Job columns are dropped', async ({ context }) => {
    await runBackfill(context.db);

    await runMigration(context.db, '0090_drop_job_serial_product_vin');

    const unitRows = await context.db.select().from(productUnits).orderBy(asc(productUnits.productSerialNumber));

    expect(unitRows.map((unit) => [unit.productSerialNumber, unit.vinNumber])).toEqual([
      ['BF-001260001', 'VIN-RIVERSIDE-1'],
      ['BF-001260002', null],
      ['BF-001260003', null],
    ]);
  });

  test('changes nothing when it runs again', async ({ context }) => {
    await runBackfill(context.db);
    const afterFirstRun = await readBackfilledRows(context.db);

    await runBackfill(context.db);

    expect(await readBackfilledRows(context.db)).toEqual(afterFirstRun);
  });
});

async function transfersForSerial(db: Db, serial: string) {
  const [unit] = await db.select().from(productUnits).where(eq(productUnits.productSerialNumber, serial));

  return db
    .select()
    .from(productUnitOwnershipTransfers)
    .where(eq(productUnitOwnershipTransfers.productUnitId, unit?.id ?? ''));
}

/** Full rows, not counts: a re-run that rewrote a link or a transfer's contents must fail too. */
async function readBackfilledRows(db: Db) {
  const [unitRows, transferRows, jobLinkRows] = await Promise.all([
    db.select().from(productUnits).orderBy(asc(productUnits.productSerialNumber)),
    db.select().from(productUnitOwnershipTransfers).orderBy(asc(productUnitOwnershipTransfers.id)),
    db.select({ code: jobs.code, productUnitId: jobs.productUnitId }).from(jobs).orderBy(asc(jobs.code)),
  ]);

  return { jobLinkRows, transferRows, unitRows };
}

/** The facts a botched backfill would take with it: the CFO, the paperwork, the schedule, the date it finished. */
async function readBuildRecord(db: Db) {
  // Ordered explicitly: the backfill's UPDATE rewrites Job rows, which changes their physical order.
  const [cfoAssemblyRows, cfoPartRows, documentRows, slotRows, jobRows] = await Promise.all([
    db.select().from(jobCfoAssemblies).orderBy(asc(jobCfoAssemblies.id)),
    db.select().from(jobCfoParts).orderBy(asc(jobCfoParts.partId)),
    db.select().from(documents).orderBy(asc(documents.id)),
    db.select().from(jobSlots).orderBy(asc(jobSlots.sequence)),
    // The serial is read raw: it lives on the restored pre-migration column, not on the Drizzle table.
    db.execute(sql`select "code", "completed_on", "product_serial_number" from "job" order by "code"`),
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

  // A genuine Customer that shares the placeholder's name. Nothing may treat it as the placeholder.
  const [decoyCustomer] = await db.insert(customers).values({ companyName: 'Stock', email: null }).returning();
  if (!decoyCustomer) throw new Error('Decoy customer insert did not return a row');

  const [soldQuote, stockQuote, customQuote, decoyQuote] = await db
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
  if (!soldQuote || !stockQuote || !customQuote || !decoyQuote) {
    throw new Error('Quote insert did not return every row');
  }

  // Jobs are written in the pre-migration shape: the serial lives on the Job and no Unit exists yet.
  await db.insert(jobs).values([
    {
      completedOn: '2026-05-04',
      createdAt: SOLD_JOB_CREATED_AT,
      id: SOLD_JOB_ID,
      quoteId: soldQuote.id,
      updatedAt: SOLD_JOB_CREATED_AT,
    },
    { createdAt: now, id: STOCK_JOB_ID, quoteId: stockQuote.id, updatedAt: now },
    { createdAt: now, id: CUSTOM_JOB_ID, quoteId: customQuote.id, updatedAt: now },
    { createdAt: now, id: DECOY_JOB_ID, quoteId: decoyQuote.id, updatedAt: now },
  ]);

  await setPreMigrationIdentity(db, SOLD_JOB_ID, {
    productId: product.id,
    sequence: 1,
    serial: 'BF-001260001',
    vin: 'VIN-RIVERSIDE-1',
  });
  await setPreMigrationIdentity(db, STOCK_JOB_ID, { productId: product.id, sequence: 2, serial: 'BF-001260002' });
  await setPreMigrationIdentity(db, DECOY_JOB_ID, { productId: product.id, sequence: 3, serial: 'BF-001260003' });

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
    decoyCustomerId: decoyCustomer.id,
    productId: product.id,
    soldQuoteId: soldQuote.id,
  };
}
