import {
  customers,
  type Db,
  jobBuildSpecAssemblies,
  jobs,
  productAssemblies,
  products,
  productUnits,
  quoteSelectedAssemblies,
  quotes,
  readMigrationStatements,
  user,
} from '@pkg/db';
import { asc, eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000c1';

const test = createTester(async ({ db }) => ({ db, seed: await seedLegacyShape(db) }));

async function runBuildSpecBackfill(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    // This historical migration predates the equipment schema, so replay it with its original
    // unqualified names resolving to the tables that now live there.
    await tx.execute(sql.raw('SET LOCAL search_path TO equipment, public'));
    for (const statement of readMigrationStatements('0097_job_build_spec_backfill')) {
      await tx.execute(sql.raw(statement));
    }
  });
}

/**
 * 0088 cannot be re-executed here: it reads the Job's serial and Product columns, which 0090 drops, so
 * the shipped statements are asserted as text instead. The rule they must encode is that a sale which
 * was cancelled never moved the machine, so the Unit has to come out of the backfill reading Stock.
 */
describe('product unit ownership backfill (0088)', () => {
  test('does not hand a machine to the Customer whose sale was cancelled', () => {
    const [, , transferInsert] = readMigrationStatements('0088_product_unit_backfill');

    expect(transferInsert).toContain('"job"."cancelled_at" IS NULL');
    expect(transferInsert).toContain(`"quote"."status" <> 'cancelled'`);
  });

  // The Unit itself must still exist for a cancelled build: the serial was minted, and the machine on
  // the floor does not stop being a machine because the sale fell through.
  test('still creates the Unit for a cancelled build', () => {
    const [unitInsert] = readMigrationStatements('0088_product_unit_backfill');

    expect(unitInsert).toContain('INSERT INTO "product_unit"');
    expect(unitInsert).not.toContain('cancelled_at');
  });
});

describe('job build spec backfill (0097)', () => {
  test("gives a legacy Job the Build Spec its Quote's selections imply", async ({ context }) => {
    await runBuildSpecBackfill(context.db);

    const rows = await buildSpecFor(context.db, context.seed.legacyJobId);

    // 0-based and in the Quote's own selection order, matching what the application writes at create.
    expect(rows).toEqual([
      { assemblyName: 'Hydraulic tipper', productAssemblyId: context.seed.tipperAssemblyId, sequence: 0 },
      { assemblyName: 'Spray kit', productAssemblyId: context.seed.sprayAssemblyId, sequence: 1 },
    ]);
  });

  // The name is the snapshot taken when the work was specified, so a catalog rename since then must not
  // rewrite what the machine is recorded as carrying.
  test('carries the quoted name rather than the current catalog name', async ({ context }) => {
    await context.db
      .update(productAssemblies)
      .set({ name: 'Hydraulic tipper (2027 revision)' })
      .where(eq(productAssemblies.id, context.seed.tipperAssemblyId));

    await runBuildSpecBackfill(context.db);

    const rows = await buildSpecFor(context.db, context.seed.legacyJobId);

    expect(rows[0]?.assemblyName).toBe('Hydraulic tipper');
  });

  test('leaves a Job that already holds a Build Spec untouched', async ({ context }) => {
    await runBuildSpecBackfill(context.db);

    const rows = await buildSpecFor(context.db, context.seed.specifiedJobId);

    expect(rows).toEqual([
      { assemblyName: 'Fitted at create', productAssemblyId: context.seed.sprayAssemblyId, sequence: 0 },
    ]);
  });

  // A Stock Build has no Quote to replay, so there is nothing to seed it from.
  test('leaves a quoteless Job alone', async ({ context }) => {
    await runBuildSpecBackfill(context.db);

    expect(await buildSpecFor(context.db, context.seed.stockBuildJobId)).toEqual([]);
  });

  test('changes nothing when it runs again', async ({ context }) => {
    await runBuildSpecBackfill(context.db);
    const afterFirstRun = await readAllBuildSpecs(context.db);

    await runBuildSpecBackfill(context.db);

    expect(await readAllBuildSpecs(context.db)).toEqual(afterFirstRun);
  });
});

async function buildSpecFor(db: Db, jobId: string) {
  return db
    .select({
      assemblyName: jobBuildSpecAssemblies.assemblyName,
      productAssemblyId: jobBuildSpecAssemblies.productAssemblyId,
      sequence: jobBuildSpecAssemblies.sequence,
    })
    .from(jobBuildSpecAssemblies)
    .where(eq(jobBuildSpecAssemblies.jobId, jobId))
    .orderBy(asc(jobBuildSpecAssemblies.sequence));
}

async function readAllBuildSpecs(db: Db) {
  return db.select().from(jobBuildSpecAssemblies).orderBy(asc(jobBuildSpecAssemblies.id));
}

/**
 * Production as 0097 will find it: a Job built before the Build Spec table existed, holding a CFO and a
 * Quote's selections but no Build Spec of its own; one created after it landed, which already has one;
 * and a Stock Build with no Quote behind it at all.
 */
async function seedLegacyShape(db: Db) {
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

  const [tipper, spray] = await db
    .insert(productAssemblies)
    .values([
      { displayOrder: 0, kind: 'optional', name: 'Hydraulic tipper', price: 500, productId: product.id },
      { displayOrder: 1, kind: 'optional', name: 'Spray kit', price: 250, productId: product.id },
    ])
    .returning();
  if (!tipper || !spray) throw new Error('Product assembly insert did not return every row');

  const [customer] = await db.insert(customers).values({ companyName: 'Highveld Haulage', email: null }).returning();
  if (!customer) throw new Error('Customer insert did not return a row');

  const [legacyUnit, specifiedUnit, stockUnit] = await db
    .insert(productUnits)
    .values(
      ['BF-001260001', 'BF-001260002', 'BF-001260003'].map((serial, index) => ({
        productId: product.id,
        productSerialNumber: serial,
        productSerialPrefix: 'BF-001',
        productSerialSequence: index + 1,
        productSerialYear: 26,
        vinNumber: null,
      })),
    )
    .returning();
  if (!legacyUnit || !specifiedUnit || !stockUnit) throw new Error('Product Unit insert did not return every row');

  const [legacyQuote, specifiedQuote] = await db
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
        customerId: customer.id,
        productId: product.id,
        quotedBasePrice: 1_000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: 'accepted',
      },
    ])
    .returning();
  if (!legacyQuote || !specifiedQuote) throw new Error('Quote insert did not return every row');

  // Inserted a second apart so the backfill's created_at ordering has something to order by.
  await db.insert(quoteSelectedAssemblies).values([
    {
      createdAt: new Date('2026-05-01T08:00:00.000Z'),
      productAssemblyId: tipper.id,
      quotedName: 'Hydraulic tipper',
      quotedPrice: 500,
      quoteId: legacyQuote.id,
    },
    {
      createdAt: new Date('2026-05-01T08:00:01.000Z'),
      productAssemblyId: spray.id,
      quotedName: 'Spray kit',
      quotedPrice: 250,
      quoteId: legacyQuote.id,
    },
    {
      productAssemblyId: spray.id,
      quotedName: 'Spray kit',
      quotedPrice: 250,
      quoteId: specifiedQuote.id,
    },
  ]);

  const [legacyJob, specifiedJob, stockBuildJob] = await db
    .insert(jobs)
    .values([
      { productUnitId: legacyUnit.id, quoteId: legacyQuote.id },
      { productUnitId: specifiedUnit.id, quoteId: specifiedQuote.id },
      { productUnitId: stockUnit.id, quoteId: null },
    ])
    .returning();
  if (!legacyJob || !specifiedJob || !stockBuildJob) throw new Error('Job insert did not return every row');

  // The Job created after #1014 landed already carries its own Build Spec, deliberately disagreeing
  // with its Quote so the backfill cannot quietly overwrite one it did not write.
  await db.insert(jobBuildSpecAssemblies).values({
    assemblyName: 'Fitted at create',
    jobId: specifiedJob.id,
    productAssemblyId: spray.id,
    sequence: 0,
  });

  return {
    legacyJobId: legacyJob.id,
    specifiedJobId: specifiedJob.id,
    sprayAssemblyId: spray.id,
    stockBuildJobId: stockBuildJob.id,
    tipperAssemblyId: tipper.id,
  };
}
