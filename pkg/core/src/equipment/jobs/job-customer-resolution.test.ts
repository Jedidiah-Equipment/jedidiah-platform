import { customers, type Db, jobs, products, productUnitOwnershipTransfers, productUnits, quotes, user } from '@pkg/db';
import { JobListInput } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { listJobCustomerOptions, listJobs } from './job-read-service.js';

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000d1';

const test = createTester(async ({ db }) => ({ db, seed: await seedJobs(db) }));

function listInput(overrides: Partial<JobListInput> = {}): JobListInput {
  return JobListInput.parse({ limit: 50, ...overrides });
}

async function listCustomerNames(db: Db, overrides: Partial<JobListInput> = {}) {
  const result = await listJobs({ db, input: listInput(overrides) });

  return result.items.map((job) => job.customerCompanyName);
}

describe('job customer resolution', () => {
  test('shows the Owner of the machine, not the Quote that built it', async ({ context }) => {
    const result = await listJobs({ db: context.db, input: listInput() });
    const sold = result.items.find((job) => job.productUnit?.productSerialNumber === 'JC-001260001');

    // Built for Riverside on its Quote, since sold on to Hilltop.
    expect(sold?.customerCompanyName).toBe('Hilltop Transport');
    expect(sold?.customerId).toBe(context.seed.hilltopId);
  });

  test('reads a Job on an unowned machine as Stock', async ({ context }) => {
    const result = await listJobs({ db: context.db, input: listInput() });
    const stock = result.items.find((job) => job.productUnit?.productSerialNumber === 'JC-001260002');

    expect(stock).toMatchObject({ customerCompanyName: null, customerId: null, customerThumbnailDataUrl: null });
  });

  test('still shows a Custom Job its Quote customer', async ({ context }) => {
    const result = await listJobs({ db: context.db, input: listInput() });
    const custom = result.items.find((job) => job.quoteKind === 'custom');

    expect(custom?.customerCompanyName).toBe('Riverside Farm');
  });

  test('filters by the Customer the list actually displays', async ({ context }) => {
    expect(await listCustomerNames(context.db, { columnFilters: { customerId: context.seed.hilltopId } })).toEqual([
      'Hilltop Transport',
    ]);
  });

  test('stops matching the first buyer once the machine is sold on', async ({ context }) => {
    // Riverside still owns nothing but the Custom Job's work; the machine it once bought is Hilltop's.
    expect(await listCustomerNames(context.db, { columnFilters: { customerId: context.seed.riversideId } })).toEqual([
      'Riverside Farm',
    ]);
  });

  test('never matches a machine we hold', async ({ context }) => {
    const stockQuoteCustomer = context.seed.stockQuoteCustomerId;

    expect(await listCustomerNames(context.db, { columnFilters: { customerId: stockQuoteCustomer } })).toEqual([]);
  });

  test('searches serials through the machine', async ({ context }) => {
    const result = await listJobs({ db: context.db, input: listInput({ search: '260002' }) });

    expect(result.items.map((job) => job.productUnit?.productSerialNumber ?? null)).toEqual(['JC-001260002']);
  });

  test('offers only Customers its own filter can match', async ({ context }) => {
    const options = await listJobCustomerOptions({
      db: context.db,
      input: { cursor: 0, limit: 0, search: '', sortBy: 'companyName', sortDirection: 'asc' },
    });

    // Hilltop owns a machine and Riverside holds the Custom Job; the Stock Quote's customer owns nothing.
    expect(options.items.map((option) => option.companyName)).toEqual(['Hilltop Transport', 'Riverside Farm']);
  });
});

async function seedJobs(db: Db) {
  const now = new Date('2026-05-01T08:00:00.000Z');

  await db.insert(user).values({
    createdAt: now,
    email: 'job-customer@example.com',
    emailVerified: true,
    id: ACTOR_USER_ID,
    name: 'Job Customer Test User',
    role: 'sales',
    updatedAt: now,
  });

  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      description: null,
      modelCode: 'JC-001',
      name: 'Job Customer Product',
      rangeId: await createProductRangeFixture(db),
    })
    .returning();
  if (!product) throw new Error('Product insert did not return a row');

  const [riverside, hilltop, stockQuoteCustomer] = await db
    .insert(customers)
    .values([
      { companyName: 'Riverside Farm', email: null },
      { companyName: 'Hilltop Transport', email: null },
      { companyName: 'Placeholder Stock', email: null },
    ])
    .returning();
  if (!riverside || !hilltop || !stockQuoteCustomer) throw new Error('Customer insert did not return every row');

  const [soldQuote, stockQuote, customQuote] = await db
    .insert(quotes)
    .values([
      {
        customerId: riverside.id,
        productId: product.id,
        quotedBasePrice: 1_000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: 'accepted',
      },
      {
        customerId: stockQuoteCustomer.id,
        productId: product.id,
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: 'accepted',
      },
      {
        customerId: riverside.id,
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

  const [soldUnit, stockUnit] = await db
    .insert(productUnits)
    .values(
      [1, 2].map((sequence) => ({
        productId: product.id,
        productSerialNumber: `JC-00126000${sequence}`,
        productSerialPrefix: 'JC-001',
        productSerialSequence: sequence,
        productSerialYear: 26,
      })),
    )
    .returning();
  if (!soldUnit || !stockUnit) throw new Error('Product unit insert did not return every row');

  await db.insert(jobs).values([
    { createdAt: now, productUnitId: soldUnit.id, quoteId: soldQuote.id, updatedAt: now },
    { createdAt: now, productUnitId: stockUnit.id, quoteId: stockQuote.id, updatedAt: now },
    { createdAt: now, quoteId: customQuote.id, updatedAt: now },
  ]);

  // Built for Riverside, then sold on to Hilltop. The Stock machine has no transfers at all.
  await db.insert(productUnitOwnershipTransfers).values([
    {
      actorUserId: ACTOR_USER_ID,
      occurredOn: '2026-05-02',
      productUnitId: soldUnit.id,
      sourceQuoteId: soldQuote.id,
      toCustomerId: riverside.id,
    },
    {
      actorUserId: ACTOR_USER_ID,
      fromCustomerId: riverside.id,
      occurredOn: '2026-06-10',
      productUnitId: soldUnit.id,
      toCustomerId: hilltop.id,
    },
  ]);

  return {
    hilltopId: hilltop.id,
    riversideId: riverside.id,
    stockQuoteCustomerId: stockQuoteCustomer.id,
  };
}
