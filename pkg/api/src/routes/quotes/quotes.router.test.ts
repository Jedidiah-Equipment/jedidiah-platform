import { auditEvents, type Db, jobStages, jobs, products, quotes, user } from '@pkg/db';
import type { QuoteDetail } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  const product = await createProduct(db);

  return {
    db,
    product,
  };
});

describe('quotes.create', () => {
  test('creates a draft quote with an inline customer and audit events', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const created = await caller.quotes.create({
      customer: {
        type: 'inline',
        companyName: 'Acme Mining',
      },
      discount: 100,
      notes: 'Demo quote',
      productId: context.product.id,
      salesPersonId: 'test-user-id',
      validUntil: '2026-06-30',
    });

    const quoteRows = await context.db.select().from(quotes);
    const events = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);

    expect(created).toMatchObject({
      code: 'QUO-00001',
      customerCompanyName: 'Acme Mining',
      productId: context.product.id,
      status: 'draft',
      total: context.product.basePrice - 100,
    });
    expect(quoteRows).toHaveLength(1);
    expect(events.map((event) => event.entityType)).toEqual(['customer', 'quote']);
  });

  test('creates a customer-only draft quote', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    const created = await caller.quotes.create({
      customer: {
        type: 'inline',
        companyName: 'Acme Mining',
      },
      notes: null,
    });

    expect(created).toMatchObject({
      customerCompanyName: 'Acme Mining',
      productId: null,
      productName: null,
      salesPersonId: null,
      status: 'draft',
      total: null,
    });
  });

  test('rejects a discount when the draft quote has no product', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    await expect(
      caller.quotes.create({
        customer: {
          type: 'inline',
          companyName: 'Acme Mining',
        },
        discount: 100,
        notes: null,
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Quote discount is invalid.',
    });
  });

  test('rejects an unknown salesperson id as bad input', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    await expect(
      caller.quotes.create({
        customer: {
          type: 'inline',
          companyName: 'Acme Mining',
        },
        discount: 100,
        notes: 'Demo quote',
        productId: context.product.id,
        salesPersonId: 'missing-user-id',
        validUntil: '2026-06-30',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Quote includes an invalid customer, product, or salesperson.',
    });
  });
});

describe('quotes.update', () => {
  test('updates a draft quote with an existing customer', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const created = await createReadyQuote(caller, context.product.id);

    const updated = await caller.quotes.update({
      ...toUpdateInput(created),
      discount: 125,
      notes: 'Updated draft terms',
      validUntil: '2026-07-31',
    });

    expect(updated).toMatchObject({
      discount: 125,
      notes: 'Updated draft terms',
      status: 'draft',
      total: context.product.basePrice - 125,
      validUntil: '2026-07-31',
    });
  });
});

describe('quotes.list', () => {
  test('searches joined quote fields and keeps totals aligned with filtered rows', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const crusherProduct = await createProduct(context.db, {
      modelCode: 'CRUSH-77',
      name: 'Crusher Bucket',
    });
    const acceptedQuote = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Acme Mining',
      discount: 150,
      productId: context.product.id,
    });
    const draftQuote = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Beta Civil',
      discount: 25,
      productId: crusherProduct.id,
    });
    const sentQuote = await salesCaller.quotes.send({ id: acceptedQuote.id });
    const finalQuote = await salesCaller.quotes.accept({ id: sentQuote.id });
    const job = await supervisorCaller.jobs.create({
      productId: context.product.id,
      quoteId: finalQuote.id,
    });
    const secondJob = await supervisorCaller.jobs.create({
      productId: context.product.id,
      quoteId: finalQuote.id,
    });

    await expect(
      salesCaller.quotes.list({
        filters: {
          statuses: ['accepted'],
        },
        page: 1,
        pageSize: 10,
        search: 'Acme',
        sortBy: 'customerCompanyName',
        sortDirection: 'asc',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        {
          code: finalQuote.code,
          customerCompanyName: 'Acme Mining',
          linkedJobs: [
            {
              jobCode: job.code,
              jobId: job.id,
            },
            {
              jobCode: secondJob.code,
              jobId: secondJob.id,
            },
          ],
        },
      ],
    });

    await expect(
      salesCaller.quotes.list({
        filters: {
          statuses: [],
        },
        page: 1,
        pageSize: 10,
        search: job.code,
        sortBy: 'createdAt',
        sortDirection: 'asc',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        {
          code: finalQuote.code,
          linkedJobs: [
            {
              jobCode: job.code,
              jobId: job.id,
            },
            {
              jobCode: secondJob.code,
              jobId: secondJob.id,
            },
          ],
        },
      ],
    });

    await expect(
      salesCaller.quotes.list({
        filters: {
          statuses: ['draft'],
        },
        page: 1,
        pageSize: 10,
        search: 'Crusher',
        sortBy: 'total',
        sortDirection: 'desc',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        {
          code: draftQuote.code,
          productName: 'Crusher Bucket',
          total: crusherProduct.basePrice - 25,
        },
      ],
    });
  });

  test('floors stale draft totals when current product price drops below discount', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const created = await createReadyQuote(caller, context.product.id);

    await context.db.update(products).set({ basePrice: 100 });

    const result = await caller.quotes.list({
      filters: {
        statuses: ['draft'],
      },
      page: 1,
      pageSize: 10,
      search: created.code,
      sortBy: 'total',
      sortDirection: 'asc',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.total).toBe(0);
  });
});

describe('quotes.send', () => {
  test('snapshots the product price and freezes later edits', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const created = await createReadyQuote(caller, context.product.id);
    const sent = await caller.quotes.send({ id: created.id });

    await context.db.update(products).set({ basePrice: 999_999 });
    const afterReprice = await caller.quotes.get({ id: sent.id });

    expect(sent).toMatchObject({
      quotedBasePrice: context.product.basePrice,
      quotedCurrencyCode: 'ZAR',
      status: 'sent',
      total: context.product.basePrice - created.discount,
    });
    expect(afterReprice.total).toBe(sent.total);
    await expect(
      caller.quotes.update({
        ...toUpdateInput(sent),
        notes: 'This should not save',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('quotes.reject', () => {
  test('rejects a sent quote', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const created = await createReadyQuote(caller, context.product.id);
    const sent = await caller.quotes.send({ id: created.id });

    const rejected = await caller.quotes.reject({ id: sent.id });

    expect(rejected.status).toBe('rejected');
    await expect(caller.quotes.accept({ id: rejected.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('jobs.create with quote links', () => {
  test('creates multiple jobs from one accepted quote with stages', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const sent = await salesCaller.quotes.send({ id: created.id });
    const accepted = await salesCaller.quotes.accept({ id: sent.id });

    await expect(supervisorCaller.quotes.get({ id: accepted.id })).resolves.toMatchObject({
      id: accepted.id,
      status: 'accepted',
    });

    const job = await supervisorCaller.jobs.create({
      productId: context.product.id,
      quoteId: accepted.id,
    });
    const jobRows = await context.db.select().from(jobs);
    const stageRows = await context.db.select().from(jobStages);

    expect(job).toMatchObject({
      productId: context.product.id,
      quoteId: accepted.id,
    });
    expect(jobRows).toHaveLength(1);
    expect(stageRows).toHaveLength(5);

    const secondJob = await supervisorCaller.jobs.create({
      productId: context.product.id,
      quoteId: accepted.id,
    });
    const afterSecondJobRows = await context.db.select().from(jobs);
    const afterSecondStageRows = await context.db.select().from(jobStages);

    expect(secondJob).toMatchObject({
      productId: context.product.id,
      quoteId: accepted.id,
    });
    expect(afterSecondJobRows).toHaveLength(2);
    expect(afterSecondStageRows).toHaveLength(10);
  });

  test('creates a job from a sent quote', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const sent = await salesCaller.quotes.send({ id: created.id });

    await expect(
      supervisorCaller.jobs.create({ productId: context.product.id, quoteId: sent.id }),
    ).resolves.toMatchObject({
      productId: context.product.id,
      quoteId: sent.id,
    });
  });

  test('creates a job from a sent quote when a Job product is selected', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const sent = await salesCaller.quotes.send({ id: created.id });

    const job = await supervisorCaller.jobs.create({
      productId: context.product.id,
      quoteId: sent.id,
    });

    expect(job).toMatchObject({
      productId: context.product.id,
      quoteId: sent.id,
    });
  });

  test('creates jobs linked to sent and product-less quotes when a Job product is selected', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const readyQuote = await createReadyQuote(salesCaller, context.product.id);
    const sentQuote = await salesCaller.quotes.send({ id: readyQuote.id });
    const productLessQuote = await salesCaller.quotes.create({
      customer: {
        type: 'inline',
        companyName: 'Customer Only Quote',
      },
      notes: null,
    });

    await expect(
      supervisorCaller.jobs.create({
        productId: context.product.id,
        quoteId: sentQuote.id,
      }),
    ).resolves.toMatchObject({
      productId: context.product.id,
      quoteId: sentQuote.id,
    });
    await expect(
      supervisorCaller.jobs.create({
        productId: context.product.id,
        quoteId: productLessQuote.id,
      }),
    ).resolves.toMatchObject({
      productId: context.product.id,
      quoteId: productLessQuote.id,
    });
  });

  test('rejects job creation from a rejected quote', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const sent = await salesCaller.quotes.send({ id: created.id });
    const rejected = await salesCaller.quotes.reject({ id: sent.id });

    await expect(
      supervisorCaller.jobs.create({
        productId: context.product.id,
        quoteId: rejected.id,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: "This quote's status does not allow job creation.",
    });
  });

  test('keeps the Quote link when creating a job with a supervisor-selected Product', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const alternateProduct = await createProduct(context.db, {
      modelCode: 'ALT-QUOTE-001',
      name: 'Alternate Quote Product',
    });
    const created = await createReadyQuote(salesCaller, context.product.id);
    const sent = await salesCaller.quotes.send({ id: created.id });
    const accepted = await salesCaller.quotes.accept({ id: sent.id });

    const job = await supervisorCaller.jobs.create({
      productId: alternateProduct.id,
      quoteId: accepted.id,
    });

    expect(job).toMatchObject({
      productId: alternateProduct.id,
      quoteId: accepted.id,
    });
    await expect(
      supervisorCaller.jobs.create({
        productId: alternateProduct.id,
        quoteId: accepted.id,
      }),
    ).resolves.toMatchObject({
      productId: alternateProduct.id,
      quoteId: accepted.id,
    });
  });
});

async function createReadyQuote(caller: AppRouterCaller, productId: string) {
  return caller.quotes.create({
    customer: {
      type: 'inline',
      companyName: 'Ready Customer',
    },
    discount: 250,
    notes: null,
    productId,
    salesPersonId: 'test-user-id',
    validUntil: '2026-06-30',
  });
}

async function createNamedQuote(
  caller: AppRouterCaller,
  {
    customerCompanyName,
    discount,
    productId,
  }: {
    customerCompanyName: string;
    discount: number;
    productId: string;
  },
) {
  return caller.quotes.create({
    customer: {
      type: 'inline',
      companyName: customerCompanyName,
    },
    discount,
    notes: null,
    productId,
    salesPersonId: 'test-user-id',
    validUntil: '2026-06-30',
  });
}

function toUpdateInput(quote: QuoteDetail) {
  return {
    id: quote.id,
    customer: {
      type: 'existing' as const,
      customerId: quote.customerId,
    },
    discount: quote.discount,
    notes: quote.notes,
    productId: quote.productId,
    salesPersonId: quote.salesPersonId ?? 'test-user-id',
    validUntil: quote.validUntil,
  };
}

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role: 'sales',
    updatedAt: now,
  });
}

async function createProduct(db: Db, overrides: Partial<typeof products.$inferInsert> = {}) {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1000,
      currencyCode: 'ZAR',
      modelCode: 'QUOTE-001',
      name: 'Quote Test Product',
      ...overrides,
    })
    .returning();

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
}
