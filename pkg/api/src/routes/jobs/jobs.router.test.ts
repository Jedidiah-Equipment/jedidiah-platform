import { customers, type Db, jobBays, products, quotes } from '@pkg/db';
import type { Product } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createActorUser } from '@/test/ai-tools.js';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'job-supervisor');
  await seedFabricationBays(db);
  const product = await createProduct(db);
  const quote = await createAcceptedQuote(db, product.id);

  return {
    product,
    quote,
  };
});

describe('jobs.listBays', () => {
  test('returns fabrication bays for authorized job readers', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));

    await expect(caller.jobs.listBays()).resolves.toMatchObject({
      items: [
        { department: 'fabrication', name: 'Fabrication Bay 1' },
        { department: 'fabrication', name: 'Fabrication Bay 2' },
        { department: 'fabrication', name: 'Fabrication Bay 3' },
      ],
    });
  });

  test('rejects roles without job read permission', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    await expect(caller.jobs.listBays()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('jobs.create', () => {
  test('creates a job with the production stage model', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));

    const job = await caller.jobs.create({
      quoteId: context.quote.id,
    });

    expect(job).toMatchObject({
      productId: context.product.id,
      productSerialNumber: expect.stringMatching(/^JOB-TEST\d{6}$/),
      productSerialPrefix: 'JOB-TEST',
      productSerialSequence: 1,
      quoteId: context.quote.id,
      vinNumber: null,
    });
    expect(job.stages.map((stage) => stage.stage)).toEqual([
      'procurement',
      'supply',
      'fabrication',
      'paint',
      'assembly',
    ]);
  });

  test('returns the product serial number from get and list, and can search by it', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const job = await caller.jobs.create({
      quoteId: context.quote.id,
    });

    await expect(caller.jobs.get({ id: job.id })).resolves.toMatchObject({
      id: job.id,
      productSerialNumber: job.productSerialNumber,
      vinNumber: null,
    });

    const result = await caller.jobs.list({
      filters: {},
      page: 1,
      pageSize: 10,
      search: job.productSerialNumber,
      sortBy: 'createdAt',
      sortDirection: 'asc',
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: job.id,
        productSerialNumber: job.productSerialNumber,
        vinNumber: null,
      }),
    ]);
  });
});

async function createProduct(db: Db): Promise<Pick<Product, 'id'>> {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'JOB-TEST',
      name: 'Job Test Product',
    })
    .returning({ id: products.id });

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
}

async function seedFabricationBays(db: Db): Promise<void> {
  const now = new Date('2026-06-05T00:00:00.000Z');

  await db.insert(jobBays).values([
    {
      createdAt: now,
      department: 'fabrication',
      id: '00000000-0000-4000-8000-000000000b01',
      name: 'Fabrication Bay 1',
      scheduleOrigin: now,
      updatedAt: now,
    },
    {
      createdAt: now,
      department: 'fabrication',
      id: '00000000-0000-4000-8000-000000000b02',
      name: 'Fabrication Bay 2',
      scheduleOrigin: now,
      updatedAt: now,
    },
    {
      createdAt: now,
      department: 'fabrication',
      id: '00000000-0000-4000-8000-000000000b03',
      name: 'Fabrication Bay 3',
      scheduleOrigin: now,
      updatedAt: now,
    },
  ]);
}

async function createAcceptedQuote(db: Db, productId: Product['id']) {
  const [customer] = await db
    .insert(customers)
    .values({
      companyName: 'Job Test Customer',
      email: null,
    })
    .returning({ id: customers.id });
  if (!customer) {
    throw new Error('Customer insert did not return a row');
  }

  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      productId,
      quotedBasePrice: 1_000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'test-user-id',
      status: 'accepted',
    })
    .returning({ id: quotes.id });

  if (!quote) {
    throw new Error('Quote insert did not return a row');
  }

  return quote;
}
