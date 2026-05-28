import {
  auditEvents,
  type Db,
  jobStages,
  jobs,
  productAssemblies,
  products,
  quoteSelectedAssemblies,
  quotes,
  sql,
  user,
} from '@pkg/db';
import { type QuoteDetail, QuoteUpdateInput } from '@pkg/schema';
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
      deliveryIncluded: true,
      deliveryPrice: 350,
      discount: 100,
      notes: 'Demo quote',
      paymentTerms: '30% deposit, balance on delivery',
      plannedDeliveryDate: '2026-07-15',
      preferredDeliveryDate: '2026-07-10',
      productId: context.product.id,
      salesPersonId: 'test-user-id',
      status: 'draft',
      validUntil: '2026-06-30',
    });

    const quoteRows = await context.db.select().from(quotes);
    const events = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);

    expect(created).toMatchObject({
      code: 'QUO-00001',
      customerCompanyName: 'Acme Mining',
      deliveryIncluded: true,
      deliveryPrice: 350,
      paymentTerms: '30% deposit, balance on delivery',
      plannedDeliveryDate: '2026-07-15',
      preferredDeliveryDate: '2026-07-10',
      productId: context.product.id,
      quotedBasePrice: context.product.basePrice,
      quotedCurrencyCode: context.product.currencyCode,
      status: 'draft',
    });
    expect(created).not.toHaveProperty('total');
    expect(quoteRows).toHaveLength(1);
    expect(quoteRows[0]).toMatchObject({
      deliveryIncluded: true,
      deliveryPrice: 350,
      plannedDeliveryDate: '2026-07-15',
      preferredDeliveryDate: '2026-07-10',
    });
    expect(events.map((event) => event.entityType)).toEqual(['customer', 'quote']);
  });

  test('rejects create input missing product, salesperson, and status at the input boundary', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    await expect(
      caller.quotes.create({
        customer: {
          type: 'inline',
          companyName: 'Acme Mining',
        },
        notes: null,
        paymentTerms: null,
      } as never),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
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
        paymentTerms: null,
        productId: context.product.id,
        salesPersonId: 'missing-user-id',
        status: 'draft',
        validUntil: '2026-06-30',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Quote includes an invalid customer, product, or salesperson.',
    });
  });

  test('updates status and fields on a non-draft quote with an audit event', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const created = await caller.quotes.create({
      customer: {
        type: 'inline',
        companyName: 'Sent Customer',
      },
      discount: 50,
      notes: null,
      paymentTerms: null,
      productId: context.product.id,
      salesPersonId: 'test-user-id',
      status: 'sent',
      validUntil: '2026-06-30',
    });

    const updated = await caller.quotes.update({
      ...toUpdateInput(created),
      notes: 'Editable after sent',
      status: 'rejected',
    });
    const events = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);
    const updateEvent = events.findLast((event) => event.entityType === 'quote' && event.action === 'updated');

    expect(updated).toMatchObject({
      notes: 'Editable after sent',
      status: 'rejected',
    });
    expect(updateEvent?.changes).toMatchObject({
      notes: {
        from: null,
        to: 'Editable after sent',
      },
      status: {
        from: 'sent',
        to: 'rejected',
      },
    });
  });

  test('snapshots selected optional assemblies and preserves stale selections', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const standardAssembly = await createProductAssembly(context.db, {
      kind: 'standard',
      name: 'Standard bucket',
      productId: context.product.id,
    });
    const optionalAssembly = await createProductAssembly(context.db, {
      kind: 'optional',
      name: 'Wear liner upgrade',
      price: 325,
      productId: context.product.id,
    });

    const created = await caller.quotes.create({
      customer: {
        type: 'inline',
        companyName: 'Assembly Customer',
      },
      discount: 25,
      notes: null,
      paymentTerms: null,
      productId: context.product.id,
      salesPersonId: 'test-user-id',
      status: 'draft',
      validUntil: '2026-06-30',
    });

    expect(created).toMatchObject({
      productAssemblies: expect.arrayContaining([
        expect.objectContaining({
          id: standardAssembly.id,
          kind: 'standard',
        }),
        expect.objectContaining({
          id: optionalAssembly.id,
          kind: 'optional',
          price: 325,
        }),
      ]),
      selectedAssemblies: [],
    });

    const withAssembly = await caller.quotes.update({
      ...toUpdateInput(created),
      selectedAssemblies: [{ type: 'catalog', productAssemblyId: optionalAssembly.id }],
    });
    const events = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);
    const updateEvent = events.findLast((event) => event.entityType === 'quote' && event.action === 'updated');
    const selectedAssembliesChange = (
      updateEvent?.changes as Record<string, { from: unknown; to: unknown }> | undefined
    )?.selectedAssemblies;

    expect(withAssembly).toMatchObject({
      selectedAssemblies: [
        expect.objectContaining({
          productAssemblyId: optionalAssembly.id,
          quotedName: 'Wear liner upgrade',
          quotedPrice: 325,
        }),
      ],
    });
    expect(selectedAssembliesChange?.from).toBe('[]');
    expect(JSON.parse(String(selectedAssembliesChange?.to))).toEqual([
      {
        productAssemblyId: optionalAssembly.id,
        quotedName: 'Wear liner upgrade',
        quotedPrice: 325,
      },
    ]);

    await context.db.delete(productAssemblies).where(sql`${productAssemblies.id} = ${optionalAssembly.id}`);

    const stale = await caller.quotes.get({ id: withAssembly.id });

    expect(stale.selectedAssemblies).toEqual([
      expect.objectContaining({
        productAssemblyId: null,
        quotedName: 'Wear liner upgrade',
        quotedPrice: 325,
      }),
    ]);

    const updated = await caller.quotes.update({
      ...toUpdateInput(stale),
      selectedAssemblies: [],
    });

    expect(updated.selectedAssemblies).toEqual([]);
    await expect(context.db.select().from(quoteSelectedAssemblies)).resolves.toEqual([]);
  });
});

describe('quotes.update', () => {
  test('updates a draft quote with an existing customer', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const created = await createReadyQuote(caller, context.product.id);

    const updated = await caller.quotes.update({
      ...toUpdateInput(created),
      deliveryIncluded: false,
      deliveryPrice: 777,
      discount: 125,
      notes: 'Updated draft terms',
      paymentTerms: '50% deposit before fabrication',
      plannedDeliveryDate: '2026-08-05',
      preferredDeliveryDate: '2026-08-12',
      validUntil: '2026-07-31',
    });
    const events = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);
    const updateEvent = events.findLast((event) => event.entityType === 'quote' && event.action === 'updated');

    expect(updated).toMatchObject({
      deliveryIncluded: false,
      deliveryPrice: 0,
      discount: 125,
      notes: 'Updated draft terms',
      paymentTerms: '50% deposit before fabrication',
      plannedDeliveryDate: '2026-08-05',
      preferredDeliveryDate: '2026-08-12',
      status: 'draft',
      validUntil: '2026-07-31',
    });
    expect(updated).not.toHaveProperty('total');
    expect(updateEvent?.changes).toMatchObject({
      deliveryIncluded: {
        from: true,
        to: false,
      },
      paymentTerms: {
        from: null,
        to: '50% deposit before fabrication',
      },
      plannedDeliveryDate: {
        from: null,
        to: '2026-08-05',
      },
      preferredDeliveryDate: {
        from: null,
        to: '2026-08-12',
      },
    });
  });

  test('rejects productId edits at the input boundary', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const alternateProduct = await createProduct(context.db, {
      modelCode: 'ALT-IMMUTABLE-001',
      name: 'Alternate Immutable Product',
    });
    const created = await createReadyQuote(caller, context.product.id);

    expect(
      QuoteUpdateInput.safeParse({
        ...toUpdateInput(created),
        productId: alternateProduct.id,
      }).success,
    ).toBe(false);

    await expect(
      caller.quotes.update({
        ...toUpdateInput(created),
        productId: alternateProduct.id,
      } as never),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  test('validates updated discounts against the frozen quote snapshot', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const created = await createReadyQuote(caller, context.product.id);

    await context.db.update(products).set({ basePrice: 100 });

    await expect(
      caller.quotes.update({
        ...toUpdateInput(created),
        discount: 500,
      }),
    ).resolves.toMatchObject({
      discount: 500,
      quotedBasePrice: context.product.basePrice,
    });

    await expect(
      caller.quotes.update({
        ...toUpdateInput(created),
        discount: context.product.basePrice + 1,
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Quote discount is invalid.',
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
    await createSalesUser(context.db, {
      email: 'another-sales@example.com',
      id: 'another-sales-id',
      name: 'Another Sales',
    });
    const createdQuote = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Acme Mining',
      discount: 150,
      paymentTerms: 'Paid before dispatch',
      productId: context.product.id,
    });
    const finalQuote = await salesCaller.quotes.update({
      ...toUpdateInput(createdQuote),
      status: 'accepted',
    });
    const draftQuote = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Beta Civil',
      deliveryPrice: 75,
      discount: 25,
      productId: crusherProduct.id,
      salesPersonId: 'another-sales-id',
    });
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
          paymentTerms: 'Paid before dispatch',
          plannedDeliveryDate: '2026-07-05',
          preferredDeliveryDate: '2026-07-01',
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
        sortBy: 'createdAt',
        sortDirection: 'desc',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        {
          code: draftQuote.code,
          productName: 'Crusher Bucket',
        },
      ],
    });

    await expect(
      salesCaller.quotes.list({
        filters: {
          customerId: finalQuote.customerId,
          statuses: [],
        },
        page: 1,
        pageSize: 10,
        search: '',
        sortBy: 'customerCompanyName',
        sortDirection: 'asc',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        {
          code: finalQuote.code,
          customerCompanyName: 'Acme Mining',
        },
      ],
    });

    await expect(
      salesCaller.quotes.list({
        filters: {
          productId: crusherProduct.id,
          salesPersonId: 'another-sales-id',
          statuses: [],
        },
        page: 1,
        pageSize: 10,
        search: '',
        sortBy: 'salesPersonName',
        sortDirection: 'asc',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        {
          code: draftQuote.code,
          productName: 'Crusher Bucket',
          salesPersonName: 'Another Sales',
        },
      ],
    });
  });

  test('keeps list pricing facts based on the frozen quote snapshot when product prices change', async ({
    context,
  }) => {
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
      sortBy: 'createdAt',
      sortDirection: 'asc',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      quotedBasePrice: context.product.basePrice,
    });
    expect(result.items[0]).not.toHaveProperty('total');
  });
});

describe('jobs.create with quote links', () => {
  test('creates multiple jobs from one accepted quote with stages', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const accepted = await salesCaller.quotes.update({
      ...toUpdateInput(created),
      status: 'accepted',
    });

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
    const sent = await salesCaller.quotes.update({
      ...toUpdateInput(created),
      status: 'sent',
    });

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
    const sent = await salesCaller.quotes.update({
      ...toUpdateInput(created),
      status: 'sent',
    });

    const job = await supervisorCaller.jobs.create({
      productId: context.product.id,
      quoteId: sent.id,
    });

    expect(job).toMatchObject({
      productId: context.product.id,
      quoteId: sent.id,
    });
  });

  test('creates jobs linked to sent quotes when a Job product is selected', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const readyQuote = await createReadyQuote(salesCaller, context.product.id);
    const sentQuote = await salesCaller.quotes.update({
      ...toUpdateInput(readyQuote),
      status: 'sent',
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
  });

  test('creates a job from a rejected quote', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const rejected = await salesCaller.quotes.update({
      ...toUpdateInput(created),
      status: 'rejected',
    });

    await expect(
      supervisorCaller.jobs.create({
        productId: context.product.id,
        quoteId: rejected.id,
      }),
    ).resolves.toMatchObject({
      productId: context.product.id,
      quoteId: rejected.id,
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
    const accepted = await salesCaller.quotes.update({
      ...toUpdateInput(created),
      status: 'accepted',
    });

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
    paymentTerms: null,
    productId,
    salesPersonId: 'test-user-id',
    status: 'draft',
    validUntil: '2026-06-30',
  });
}

async function createNamedQuote(
  caller: AppRouterCaller,
  {
    customerCompanyName,
    deliveryPrice = 0,
    discount,
    paymentTerms = null,
    productId,
    salesPersonId = 'test-user-id',
  }: {
    customerCompanyName: string;
    deliveryPrice?: number;
    discount: number;
    paymentTerms?: string | null;
    productId: string;
    salesPersonId?: string;
  },
) {
  return caller.quotes.create({
    customer: {
      type: 'inline',
      companyName: customerCompanyName,
    },
    deliveryIncluded: true,
    deliveryPrice,
    discount,
    notes: null,
    paymentTerms,
    plannedDeliveryDate: '2026-07-05',
    preferredDeliveryDate: '2026-07-01',
    productId,
    salesPersonId,
    status: 'draft',
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
    deliveryIncluded: quote.deliveryIncluded,
    deliveryPrice: quote.deliveryPrice,
    discount: quote.discount,
    notes: quote.notes,
    paymentTerms: quote.paymentTerms,
    plannedDeliveryDate: quote.plannedDeliveryDate,
    preferredDeliveryDate: quote.preferredDeliveryDate,
    salesPersonId: quote.salesPersonId,
    selectedAssemblies: quote.selectedAssemblies.map((selection) => ({
      type: 'existing' as const,
      id: selection.id,
    })),
    status: quote.status,
    validUntil: quote.validUntil,
  };
}

async function createActorUser(db: Db) {
  await createSalesUser(db, {
    email: 'test@example.com',
    id: 'test-user-id',
    name: 'Test User',
  });
}

async function createSalesUser(
  db: Db,
  {
    email,
    id,
    name,
  }: {
    email: string;
    id: string;
    name: string;
  },
) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email,
    emailVerified: true,
    id,
    name,
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
      buildTimeDays: 14,
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

async function createProductAssembly(db: Db, values: typeof productAssemblies.$inferInsert) {
  const [assembly] = await db.insert(productAssemblies).values(values).returning();

  if (!assembly) {
    throw new Error('Product assembly insert did not return a row');
  }

  return assembly;
}
