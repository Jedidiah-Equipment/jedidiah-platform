import {
  customers,
  type Db,
  jobBuildSpecAssemblies,
  jobCfoAssemblies,
  jobs,
  products,
  productUnitOwnershipTransfers,
  quotes,
  user,
} from '@pkg/db';
import { DateOnlyIso, ProductUnitListInput } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { ProductUnitNotFoundError } from './product-unit-errors.js';
import { getProductUnit, listProductUnits } from './product-unit-read-service.js';
import { createProductUnit, lockUnitForOwnership, updateProductUnit } from './product-unit-service.js';

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000b1';
const PRODUCT_THUMBNAIL_DATA_URL = `data:image/jpeg;base64,${'a'.repeat(16)}`;

const test = createTester(async ({ db }) => ({ db, seed: await seedUnits(db) }));

function listInput(overrides: Partial<ProductUnitListInput> = {}): ProductUnitListInput {
  return ProductUnitListInput.parse({ limit: 50, ...overrides });
}

describe('listProductUnits', () => {
  test('lists every machine with its serial and product', async ({ context }) => {
    const result = await listProductUnits({ db: context.db, input: listInput() });

    expect(result.total).toBe(4);
    expect(result.items.map((item) => item.productSerialNumber).sort()).toEqual([
      'OT-001260001',
      'PU-001260001',
      'PU-001260002',
      'PU-001260003',
    ]);
    expect(result.items.find((item) => item.productSerialNumber === 'PU-001260001')?.product).toMatchObject({
      modelCode: 'PU-001',
      name: 'Unit Test Product',
    });
  });

  test('carries the Product thumbnail, and null for a Product without one', async ({ context }) => {
    const result = await listProductUnits({ db: context.db, input: listInput() });
    const bySerial = new Map(result.items.map((item) => [item.productSerialNumber as string, item]));

    expect(bySerial.get('PU-001260001')?.product.thumbnailDataUrl).toBe(PRODUCT_THUMBNAIL_DATA_URL);
    expect(bySerial.get('OT-001260001')?.product.thumbnailDataUrl).toBeNull();
  });

  test('sorts by the name of the Product the machine was built as', async ({ context }) => {
    const ascending = await listProductUnits({
      db: context.db,
      input: listInput({ sortBy: 'productName', sortDirection: 'asc' }),
    });
    const descending = await listProductUnits({
      db: context.db,
      input: listInput({ sortBy: 'productName', sortDirection: 'desc' }),
    });

    // 'Other Test Product' sorts ahead of 'Unit Test Product', so its one machine leads the page.
    expect(ascending.items.map((item) => item.product.name)).toEqual([
      'Other Test Product',
      'Unit Test Product',
      'Unit Test Product',
      'Unit Test Product',
    ]);
    expect(descending.items.at(-1)?.productSerialNumber).toBe('OT-001260001');
  });

  test('reads an unsold machine as Stock and a sold one as its owner', async ({ context }) => {
    const result = await listProductUnits({ db: context.db, input: listInput() });
    const bySerial = new Map(result.items.map((item) => [item.productSerialNumber as string, item]));

    expect(bySerial.get('PU-001260002')?.owner).toBeNull();
    expect(bySerial.get('PU-001260001')?.owner).toMatchObject({ companyName: 'Riverside Farm' });
  });

  test('reads a returned machine as Stock again', async ({ context }) => {
    const result = await listProductUnits({ db: context.db, input: listInput() });
    const returned = result.items.find((item) => item.productSerialNumber === 'PU-001260003');

    expect(returned?.owner).toBeNull();
  });

  test('filters to the machines we hold', async ({ context }) => {
    const result = await listProductUnits({ db: context.db, input: listInput({ columnFilters: { owner: 'stock' } }) });

    expect(result.items.map((item) => item.productSerialNumber).sort()).toEqual([
      'OT-001260001',
      'PU-001260002',
      'PU-001260003',
    ]);
  });

  test('filters to one owner', async ({ context }) => {
    const result = await listProductUnits({
      db: context.db,
      input: listInput({ columnFilters: { owner: context.seed.customerId } }),
    });

    expect(result.items.map((item) => item.productSerialNumber)).toEqual(['PU-001260001']);
  });

  test('filters by build state', async ({ context }) => {
    const onHand = await listProductUnits({
      db: context.db,
      input: listInput({ columnFilters: { buildState: 'on-hand' } }),
    });
    const inBuild = await listProductUnits({
      db: context.db,
      input: listInput({ columnFilters: { buildState: 'in-build' } }),
    });

    // The rebuilt machine is On Hand off its live rebuild, not its cancelled first attempt.
    expect(onHand.items.map((item) => item.productSerialNumber).sort()).toEqual(['OT-001260001']);
    expect(inBuild.items.map((item) => item.productSerialNumber).sort()).toEqual(['PU-001260002', 'PU-001260003']);
  });

  test('filters to the built machines a Customer owns', async ({ context }) => {
    const result = await listProductUnits({
      db: context.db,
      input: listInput({ columnFilters: { buildState: 'complete' } }),
    });

    // Complete is On Hand plus an Owner, so the built machine we still hold must not appear here.
    expect(result.items.map((item) => item.productSerialNumber)).toEqual(['PU-001260001']);
    expect(result.total).toBe(1);
  });

  test('leaves an owned machine that is still in build out of both built states', async ({ context }) => {
    // Ownership moves at the sale, not at the completion, so a build-to-order machine is owned in a Bay.
    await context.db.insert(productUnitOwnershipTransfers).values({
      actorUserId: ACTOR_USER_ID,
      occurredOn: '2026-05-20',
      productUnitId: context.seed.stockUnitId,
      toCustomerId: context.seed.customerId,
    });

    const [inBuild, onHand, complete] = await Promise.all([
      listProductUnits({ db: context.db, input: listInput({ columnFilters: { buildState: 'in-build' } }) }),
      listProductUnits({ db: context.db, input: listInput({ columnFilters: { buildState: 'on-hand' } }) }),
      listProductUnits({ db: context.db, input: listInput({ columnFilters: { buildState: 'complete' } }) }),
    ]);

    expect(inBuild.items.map((item) => item.productSerialNumber)).toContain('PU-001260002');
    expect(onHand.items.map((item) => item.productSerialNumber)).not.toContain('PU-001260002');
    expect(complete.items.map((item) => item.productSerialNumber)).not.toContain('PU-001260002');
  });

  test('filters to one product, excluding the others', async ({ context }) => {
    const result = await listProductUnits({
      db: context.db,
      input: listInput({ columnFilters: { productId: context.seed.otherProductId } }),
    });

    expect(result.items.map((item) => item.productSerialNumber)).toEqual(['OT-001260001']);
  });

  test('searches by serial number', async ({ context }) => {
    const result = await listProductUnits({ db: context.db, input: listInput({ search: '260002' }) });

    expect(result.items.map((item) => item.productSerialNumber)).toEqual(['PU-001260002']);
  });

  test('searches by VIN', async ({ context }) => {
    const result = await listProductUnits({ db: context.db, input: listInput({ search: 'VIN-UNIT' }) });

    expect(result.items.map((item) => item.productSerialNumber)).toEqual(['PU-001260001']);
  });

  test('searches by the Customer holding the machine now, not one that held it before', async ({ context }) => {
    const result = await listProductUnits({ db: context.db, input: listInput({ search: 'Riverside' }) });

    // The returned and rebuilt machines were Riverside's once and are Stock again, so they must not match.
    expect(result.items.map((item) => item.productSerialNumber)).toEqual(['PU-001260001']);
    // The count runs without the list's joins, so it has to agree with the page the search returned.
    expect(result.total).toBe(1);
  });

  test('searches by product name', async ({ context }) => {
    const result = await listProductUnits({ db: context.db, input: listInput({ search: 'Other Test' }) });

    expect(result.items.map((item) => item.productSerialNumber)).toEqual(['OT-001260001']);
    expect(result.total).toBe(1);
  });

  test('searches by product model code', async ({ context }) => {
    // A Unit's serial carries the model code it was built under, so only a later rename tells the two
    // apart: the machine keeps serial OT-001260001 while its Product answers to the new code.
    await context.db.update(products).set({ modelCode: 'ZZ-999' }).where(eq(products.id, context.seed.otherProductId));

    const result = await listProductUnits({ db: context.db, input: listInput({ search: 'ZZ-999' }) });

    expect(result.items.map((item) => item.productSerialNumber)).toEqual(['OT-001260001']);
    expect(result.total).toBe(1);
  });

  test('finds nothing for a search no machine matches', async ({ context }) => {
    const result = await listProductUnits({ db: context.db, input: listInput({ search: 'no-such-machine' }) });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  test('reports the total ahead of the page it returned', async ({ context }) => {
    const result = await listProductUnits({ db: context.db, input: listInput({ limit: 2 }) });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(4);
  });
});

describe('getProductUnit', () => {
  test('shows what the machine is, who holds it, and what is fitted', async ({ context }) => {
    const detail = await getProductUnit({ db: context.db, id: context.seed.soldUnitId });

    expect(detail).toMatchObject({
      buildState: 'on-hand',
      owner: { companyName: 'Riverside Farm' },
      productSerialNumber: 'PU-001260001',
      vinNumber: 'VIN-UNIT-1',
    });
    expect(detail.asBuiltSpec.map((assembly) => assembly.name)).toEqual(['Heavy Axle Upgrade', 'Toolbox']);
  });

  test('carries the Product thumbnail', async ({ context }) => {
    const detail = await getProductUnit({ db: context.db, id: context.seed.soldUnitId });

    expect(detail.product.thumbnailDataUrl).toBe(PRODUCT_THUMBNAIL_DATA_URL);
  });

  test('lists the machine ownership history oldest first', async ({ context }) => {
    const detail = await getProductUnit({ db: context.db, id: context.seed.returnedUnitId });

    expect(detail.ownershipHistory).toHaveLength(2);
    expect(detail.ownershipHistory[0]).toMatchObject({
      fromCustomer: null,
      occurredOn: '2026-05-02',
      toCustomer: { companyName: 'Riverside Farm' },
    });
    expect(detail.ownershipHistory[1]).toMatchObject({
      fromCustomer: { companyName: 'Riverside Farm' },
      occurredOn: '2026-05-20',
      toCustomer: null,
    });
    expect(detail.owner).toBeNull();
  });

  test('attributes a transfer to the person who recorded it and the Quote behind it', async ({ context }) => {
    const detail = await getProductUnit({ db: context.db, id: context.seed.soldUnitId });

    expect(detail.ownershipHistory[0]).toMatchObject({
      actor: { name: 'Unit Test User' },
      sourceQuote: { code: expect.stringMatching(/^QUO-/) },
    });
  });

  test('records the system as the actor when nobody entered the transfer', async ({ context }) => {
    const detail = await getProductUnit({ db: context.db, id: context.seed.returnedUnitId });

    expect(detail.ownershipHistory[1]?.actor).toBeNull();
  });

  test('attributes an interface-written return to the person who recorded it', async ({ context }) => {
    const detail = await getProductUnit({ db: context.db, id: context.seed.rebuiltUnitId });

    expect(detail.ownershipHistory[1]?.actor).toMatchObject({ name: 'Unit Test User' });
  });

  test('lists every Job that touched the machine', async ({ context }) => {
    const detail = await getProductUnit({ db: context.db, id: context.seed.soldUnitId });

    expect(detail.jobs).toHaveLength(2);
    expect(detail.jobs[0]).toMatchObject({ code: expect.stringMatching(/^JOB-/), completedOn: '2026-05-10' });
  });

  test('reads build state from the build Job, not a later rework', async ({ context }) => {
    const detail = await getProductUnit({ db: context.db, id: context.seed.soldUnitId });

    // The rework Job is still open; the machine is On Hand because its build finished.
    expect(detail.jobs).toHaveLength(2);
    expect(detail.jobs[1]?.completedOn).toBeNull();
    expect(detail.buildState).toBe('on-hand');
  });

  test('counts assemblies fitted by a rework as part of the As-Built Spec', async ({ context }) => {
    const detail = await getProductUnit({ db: context.db, id: context.seed.soldUnitId });

    expect(detail.asBuiltSpec.map((assembly) => assembly.name)).toEqual(['Heavy Axle Upgrade', 'Toolbox']);
  });

  test('keeps a cancelled Job in the history it belongs to', async ({ context }) => {
    const detail = await getProductUnit({ db: context.db, id: context.seed.rebuiltUnitId });

    expect(detail.jobs).toHaveLength(2);
    expect(detail.jobs.filter((job) => job.cancelledAt !== null)).toHaveLength(1);
  });

  test('counts nothing a cancelled Job planned as fitted, and reads build state past it', async ({ context }) => {
    const detail = await getProductUnit({ db: context.db, id: context.seed.rebuiltUnitId });

    // Its CFO is a plan, not a record: charging the next buyer for a Winch never fitted is the worse error.
    expect(detail.asBuiltSpec).toEqual([]);
    // And the cancelled build must not strand the Unit in build behind a Job that never finishes.
    expect(detail.buildState).toBe('on-hand');
  });

  test('rejects a machine that does not exist', async ({ context }) => {
    await expect(getProductUnit({ db: context.db, id: '00000000-0000-4000-8000-00000000ffff' })).rejects.toBeInstanceOf(
      ProductUnitNotFoundError,
    );
  });
});

async function seedUnits(db: Db) {
  const now = new Date('2026-05-01T08:00:00.000Z');

  await db.insert(user).values({
    createdAt: now,
    email: 'units@example.com',
    emailVerified: true,
    id: ACTOR_USER_ID,
    name: 'Unit Test User',
    role: 'sales',
    updatedAt: now,
  });

  const rangeId = await createProductRangeFixture(db);
  const productRows = await db
    .insert(products)
    .values([
      {
        basePrice: 1_000,
        buildTimeDays: 14,
        currencyCode: 'ZAR',
        description: null,
        modelCode: 'PU-001',
        name: 'Unit Test Product',
        rangeId,
        thumbnailDataUrl: PRODUCT_THUMBNAIL_DATA_URL,
      },
      {
        basePrice: 2_000,
        buildTimeDays: 20,
        currencyCode: 'ZAR',
        description: null,
        modelCode: 'OT-001',
        name: 'Other Test Product',
        rangeId,
      },
    ])
    .returning();
  const [product, otherProduct] = productRows;
  if (!product || !otherProduct) throw new Error('Product insert did not return every row');

  const [customer] = await db.insert(customers).values({ companyName: 'Riverside Farm', email: null }).returning();
  if (!customer) throw new Error('Customer insert did not return a row');

  // The live-only Quote index still leaves quoteless Stock Builds independent.
  const quoteRows = await db
    .insert(quotes)
    .values(
      [1, 2, 3, 4, 5, 6].map(() => ({
        customerId: customer.id,
        productId: product.id,
        quotedBasePrice: 1_000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: 'accepted' as const,
      })),
    )
    .returning();
  const [quote, secondQuote, thirdQuote, reworkQuote, cancelledQuote, rebuildQuote] = quoteRows;
  if (!quote || !secondQuote || !thirdQuote || !reworkQuote || !cancelledQuote || !rebuildQuote) {
    throw new Error('Quote insert did not return every row');
  }

  const unitRows = await db.transaction(async (tx) => {
    const soldUnit = await createProductUnit({
      actorUserId: ACTOR_USER_ID,
      initialOwner: { customerId: customer.id, sourceQuoteId: quote.id },
      plantToday: DateOnlyIso.parse('2026-05-02'),
      productId: product.id,
      tx,
    });
    const stockUnit = await createProductUnit({
      actorUserId: ACTOR_USER_ID,
      initialOwner: null,
      plantToday: DateOnlyIso.parse('2026-05-02'),
      productId: product.id,
      tx,
    });
    const returnedUnit = await createProductUnit({
      actorUserId: ACTOR_USER_ID,
      initialOwner: { customerId: customer.id, sourceQuoteId: thirdQuote.id },
      plantToday: DateOnlyIso.parse('2026-05-02'),
      productId: product.id,
      tx,
    });
    const rebuiltUnit = await createProductUnit({
      actorUserId: ACTOR_USER_ID,
      initialOwner: null,
      plantToday: DateOnlyIso.parse('2026-05-02'),
      productId: otherProduct.id,
      tx,
    });

    const returnedOwnership = await lockUnitForOwnership(tx, returnedUnit.id);
    if (!returnedOwnership?.latest) throw new Error('Created sold Product Unit has no Ownership Transfer');

    // Backfill migrations legitimately bypass the application writer and identify the system with a
    // null actor. Keep that persisted production state covered at the read boundary.
    await tx.insert(productUnitOwnershipTransfers).values({
      actorUserId: null,
      createdAt: new Date(returnedOwnership.latest.createdAt.getTime() + 1),
      fromCustomerId: customer.id,
      occurredOn: '2026-05-20',
      productUnitId: returnedUnit.id,
      sourceQuoteId: thirdQuote.id,
      toCustomerId: null,
    });

    const rebuiltOwnership = await lockUnitForOwnership(tx, rebuiltUnit.id);
    if (!rebuiltOwnership) throw new Error('Created Product Unit was not found');
    await rebuiltOwnership.record({
      actorUserId: ACTOR_USER_ID,
      occurredOn: '2026-05-02',
      sourceQuoteId: rebuildQuote.id,
      toCustomerId: customer.id,
    });
    await rebuiltOwnership.record({
      actorUserId: ACTOR_USER_ID,
      occurredOn: '2026-05-20',
      sourceQuoteId: rebuildQuote.id,
      toCustomerId: null,
    });

    return [soldUnit, stockUnit, returnedUnit, rebuiltUnit] as const;
  });
  const [soldUnit, stockUnit, returnedUnit, rebuiltUnit] = unitRows;

  await updateProductUnit({
    actorUserId: ACTOR_USER_ID,
    db,
    input: { id: soldUnit.id, vinNumber: 'VIN-UNIT-1' },
  });

  // Serials are still written to the Job as well: `job_product_serial_shape` holds until #1013.
  const serialColumns = (unit: (typeof unitRows)[number]) => ({
    productId: product.id,
    productSerialNumber: unit.productSerialNumber,
    productSerialPrefix: unit.productSerialPrefix,
    productSerialSequence: unit.productSerialSequence,
    productSerialYear: unit.productSerialYear,
    productUnitId: unit.id,
  });

  const later = new Date('2026-05-15T08:00:00.000Z');
  const jobRows = await db
    .insert(jobs)
    .values([
      { ...serialColumns(soldUnit), completedOn: '2026-05-10', createdAt: now, quoteId: quote.id, updatedAt: now },
      { ...serialColumns(stockUnit), createdAt: now, quoteId: secondQuote.id, updatedAt: now },
      { ...serialColumns(returnedUnit), createdAt: now, quoteId: thirdQuote.id, updatedAt: now },
      // A rework fitting one more assembly, still open: the machine stays On Hand off its build.
      // Reworks mint no serial — `job_product_serial_number_unique` holds one serial to one Job until #1013.
      { createdAt: later, productUnitId: soldUnit.id, quoteId: reworkQuote.id, updatedAt: later },
      // A cancelled build followed by the real one, both on the same machine.
      {
        ...serialColumns(rebuiltUnit),
        cancelledAt: now,
        createdAt: now,
        quoteId: cancelledQuote.id,
        updatedAt: now,
      },
      {
        completedOn: '2026-05-18',
        createdAt: later,
        productUnitId: rebuiltUnit.id,
        quoteId: rebuildQuote.id,
        updatedAt: later,
      },
    ])
    .returning();
  const [soldJob, , , reworkJob, cancelledJob] = jobRows;
  if (!soldJob || !reworkJob || !cancelledJob) throw new Error('Job insert did not return every row');

  // The As-Built Spec is the union of the Jobs' Build Specs, so that is what these seed. The CFO rows
  // alongside them are what each Job's Build Spec produced, and exist here to prove the read no longer
  // takes the standard-kind entries or the cancelled build's plan from them.
  await db.insert(jobBuildSpecAssemblies).values([
    { assemblyName: 'Heavy Axle Upgrade', jobId: soldJob.id, sequence: 0 },
    { assemblyName: 'Toolbox', jobId: reworkJob.id, sequence: 0 },
    // Never fitted: this build was cancelled.
    { assemblyName: 'Winch', jobId: cancelledJob.id, sequence: 0 },
  ]);

  await db.insert(jobCfoAssemblies).values([
    { assemblyName: 'Standard Chassis', jobId: soldJob.id, kind: 'standard', sequence: 0 },
    { assemblyName: 'Heavy Axle Upgrade', jobId: soldJob.id, kind: 'optional', sequence: 1 },
    { assemblyName: 'Toolbox', jobId: reworkJob.id, kind: 'optional', sequence: 0 },
    { assemblyName: 'Winch', jobId: cancelledJob.id, kind: 'optional', sequence: 0 },
  ]);

  return {
    customerId: customer.id,
    otherProductId: otherProduct.id,
    productId: product.id,
    rebuiltUnitId: rebuiltUnit.id,
    returnedUnitId: returnedUnit.id,
    soldUnitId: soldUnit.id,
    stockUnitId: stockUnit.id,
  };
}
