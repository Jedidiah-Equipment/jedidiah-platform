import {
  customers,
  type Db,
  jobCfoAssemblies,
  jobs,
  products,
  productUnitOwnershipTransfers,
  productUnits,
  quotes,
  user,
} from '@pkg/db';
import { ProductUnitListInput } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { ProductUnitNotFoundError } from './product-unit-errors.js';
import { getProductUnit, listProductUnits } from './product-unit-read-service.js';

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000b1';

const test = createTester(async ({ db }) => ({ db, seed: await seedUnits(db) }));

function listInput(overrides: Partial<ProductUnitListInput> = {}): ProductUnitListInput {
  return ProductUnitListInput.parse({ pageSize: 50, ...overrides });
}

describe('listProductUnits', () => {
  test('lists every machine with its serial and product', async ({ context }) => {
    const result = await listProductUnits({ db: context.db, input: listInput() });

    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.productSerialNumber).sort()).toEqual([
      'PU-001260001',
      'PU-001260002',
      'PU-001260003',
    ]);
    expect(result.items[0]?.product).toMatchObject({ modelCode: 'PU-001', name: 'Unit Test Product' });
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

    expect(result.items.map((item) => item.productSerialNumber).sort()).toEqual(['PU-001260002', 'PU-001260003']);
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

    expect(onHand.items.map((item) => item.productSerialNumber)).toEqual(['PU-001260001']);
    expect(inBuild.items.map((item) => item.productSerialNumber).sort()).toEqual(['PU-001260002', 'PU-001260003']);
  });

  test('filters by product', async ({ context }) => {
    const result = await listProductUnits({
      db: context.db,
      input: listInput({ columnFilters: { productId: context.seed.productId } }),
    });

    expect(result.total).toBe(3);
  });

  test('searches by serial number', async ({ context }) => {
    const result = await listProductUnits({ db: context.db, input: listInput({ search: '260002' }) });

    expect(result.items.map((item) => item.productSerialNumber)).toEqual(['PU-001260002']);
  });

  test('reports the total ahead of the page it returned', async ({ context }) => {
    const result = await listProductUnits({ db: context.db, input: listInput({ pageSize: 2 }) });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(3);
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
    expect(detail.asBuiltSpec.map((assembly) => assembly.name)).toEqual(['Heavy Axle Upgrade']);
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

  test('lists every Job that touched the machine', async ({ context }) => {
    const detail = await getProductUnit({ db: context.db, id: context.seed.soldUnitId });

    expect(detail.jobs).toHaveLength(1);
    expect(detail.jobs[0]).toMatchObject({ code: expect.stringMatching(/^JOB-/), completedOn: '2026-05-10' });
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
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      description: null,
      modelCode: 'PU-001',
      name: 'Unit Test Product',
      rangeId,
    })
    .returning();
  if (!product) throw new Error('Product insert did not return a row');

  const [customer] = await db.insert(customers).values({ companyName: 'Riverside Farm', email: null }).returning();
  if (!customer) throw new Error('Customer insert did not return a row');

  // One Quote per Job: `job_quote_id_unique` still holds a Job to exactly one Quote.
  const quoteRows = await db
    .insert(quotes)
    .values(
      [1, 2, 3].map(() => ({
        customerId: customer.id,
        productId: product.id,
        quotedBasePrice: 1_000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: 'accepted' as const,
      })),
    )
    .returning();
  const [quote, secondQuote, thirdQuote] = quoteRows;
  if (!quote || !secondQuote || !thirdQuote) throw new Error('Quote insert did not return every row');

  const unitRows = await db
    .insert(productUnits)
    .values(
      [1, 2, 3].map((sequence) => ({
        productId: product.id,
        productSerialNumber: `PU-00126000${sequence}`,
        productSerialPrefix: 'PU-001',
        productSerialSequence: sequence,
        productSerialYear: 26,
        vinNumber: sequence === 1 ? 'VIN-UNIT-1' : null,
      })),
    )
    .returning();
  const [soldUnit, stockUnit, returnedUnit] = unitRows;
  if (!soldUnit || !stockUnit || !returnedUnit) throw new Error('Product unit insert did not return every row');

  // Serials are still written to the Job as well: `job_product_serial_shape` holds until #1013.
  const serialColumns = (unit: (typeof unitRows)[number]) => ({
    productId: product.id,
    productSerialNumber: unit.productSerialNumber,
    productSerialPrefix: unit.productSerialPrefix,
    productSerialSequence: unit.productSerialSequence,
    productSerialYear: unit.productSerialYear,
    productUnitId: unit.id,
  });

  const jobRows = await db
    .insert(jobs)
    .values([
      { ...serialColumns(soldUnit), completedOn: '2026-05-10', createdAt: now, quoteId: quote.id, updatedAt: now },
      { ...serialColumns(stockUnit), createdAt: now, quoteId: secondQuote.id, updatedAt: now },
      { ...serialColumns(returnedUnit), createdAt: now, quoteId: thirdQuote.id, updatedAt: now },
    ])
    .returning();
  const [soldJob] = jobRows;
  if (!soldJob) throw new Error('Job insert did not return a row');

  await db.insert(jobCfoAssemblies).values([
    { assemblyName: 'Standard Chassis', jobId: soldJob.id, kind: 'standard', sequence: 0 },
    { assemblyName: 'Heavy Axle Upgrade', jobId: soldJob.id, kind: 'optional', sequence: 1 },
  ]);

  await db.insert(productUnitOwnershipTransfers).values([
    {
      actorUserId: ACTOR_USER_ID,
      occurredOn: '2026-05-02',
      productUnitId: soldUnit.id,
      sourceQuoteId: quote.id,
      toCustomerId: customer.id,
    },
    {
      actorUserId: ACTOR_USER_ID,
      occurredOn: '2026-05-02',
      productUnitId: returnedUnit.id,
      sourceQuoteId: quote.id,
      toCustomerId: customer.id,
    },
    // Returned to Stock: a later row with no destination, and no person behind it.
    {
      fromCustomerId: customer.id,
      occurredOn: '2026-05-20',
      productUnitId: returnedUnit.id,
      toCustomerId: null,
    },
  ]);

  return {
    customerId: customer.id,
    productId: product.id,
    returnedUnitId: returnedUnit.id,
    soldUnitId: soldUnit.id,
    stockUnitId: stockUnit.id,
  };
}
