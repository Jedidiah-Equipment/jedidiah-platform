import {
  auditEvents,
  customers,
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
      deliveryIncluded: true,
      deliveryPrice: 350,
      depositPercent: 30,
      discountAmount: 100,
      notes: 'Demo quote',
      documentNotes: '30% deposit, balance on delivery',
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
      depositPercent: 30,
      deliveryIncluded: true,
      deliveryPrice: 350,
      documentNotes: '30% deposit, balance on delivery',
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
      depositPercent: 30,
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
        documentNotes: null,
      } as never),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  test('creates a cancelled quote as a normal status', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    const created = await caller.quotes.create({
      customer: {
        type: 'inline',
        companyName: 'Cancelled Customer',
      },
      notes: null,
      documentNotes: null,
      productId: context.product.id,
      salesPersonId: 'test-user-id',
      status: 'cancelled',
      validUntil: null,
    });

    expect(created).toMatchObject({
      customerCompanyName: 'Cancelled Customer',
      depositPercent: 0,
      discountAmount: 0,
      status: 'cancelled',
    });
  });

  test('rejects a negative deposit percent at the input boundary', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    await expect(
      caller.quotes.create({
        customer: {
          type: 'inline',
          companyName: 'Acme Mining',
        },
        depositPercent: -1,
        notes: null,
        documentNotes: null,
        productId: context.product.id,
        salesPersonId: 'test-user-id',
        status: 'draft',
        validUntil: null,
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  test('rejects a deposit percent above 100 at the input boundary', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    await expect(
      caller.quotes.create({
        customer: {
          type: 'inline',
          companyName: 'Acme Mining',
        },
        depositPercent: 101,
        notes: null,
        documentNotes: null,
        productId: context.product.id,
        salesPersonId: 'test-user-id',
        status: 'draft',
        validUntil: null,
      }),
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
        discountAmount: 100,
        notes: 'Demo quote',
        documentNotes: null,
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
      discountAmount: 50,
      notes: null,
      documentNotes: null,
      productId: context.product.id,
      salesPersonId: 'test-user-id',
      status: 'sent',
      validUntil: '2026-06-30',
    });

    const updated = await caller.quotes.update({
      ...toUpdateInput(created),
      notes: 'Editable after sent',
      status: 'cancelled',
    });
    const events = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);
    const updateEvent = events.findLast((event) => event.entityType === 'quote' && event.action === 'updated');

    expect(updated).toMatchObject({
      notes: 'Editable after sent',
      status: 'cancelled',
    });
    expect(updateEvent?.changes).toMatchObject({
      notes: {
        from: null,
        to: 'Editable after sent',
      },
      status: {
        from: 'sent',
        to: 'cancelled',
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
      discountAmount: 25,
      notes: null,
      documentNotes: null,
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
  test('updates editable draft fields without changing the quote identity', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const alternateSalesPersonId = 'draft-edit-sales-id';
    await createSalesUser(context.db, {
      email: 'draft-edit-sales@example.com',
      id: alternateSalesPersonId,
      name: 'Draft Edit Sales',
    });
    const created = await createReadyQuote(caller, context.product.id);

    const updated = await caller.quotes.update({
      ...toUpdateInput(created),
      depositPercent: 50,
      deliveryIncluded: false,
      deliveryPrice: 777,
      discountAmount: 125,
      notes: 'Updated draft terms',
      documentNotes: '50% deposit before fabrication',
      plannedDeliveryDate: '2026-08-05',
      preferredDeliveryDate: '2026-08-12',
      salesPersonId: alternateSalesPersonId,
      status: 'sent',
      validUntil: '2026-07-31',
    });
    const events = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);
    const updateEvent = events.findLast((event) => event.entityType === 'quote' && event.action === 'updated');

    expect(updated).toMatchObject({
      deliveryIncluded: false,
      deliveryPrice: 0,
      depositPercent: 50,
      discountAmount: 125,
      notes: 'Updated draft terms',
      documentNotes: '50% deposit before fabrication',
      plannedDeliveryDate: '2026-08-05',
      preferredDeliveryDate: '2026-08-12',
      productId: created.productId,
      quotedBasePrice: created.quotedBasePrice,
      salesPersonId: alternateSalesPersonId,
      status: 'sent',
      validUntil: '2026-07-31',
    });
    expect(updated).not.toHaveProperty('total');
    expect(updateEvent?.changes).toMatchObject({
      deliveryIncluded: {
        from: true,
        to: false,
      },
      depositPercent: {
        from: 0,
        to: 50,
      },
      documentNotes: {
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

  test('rejects customer and product changes at the update input boundary', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const alternateProduct = await createProduct(context.db, {
      modelCode: 'ALT-LOCKED-001',
      name: 'Alternate Locked Product',
    });
    const alternateCustomer = await createCustomer(context.db, 'Alternate Locked Customer');
    const created = await createReadyQuote(caller, context.product.id);

    await expect(
      caller.quotes.update({
        ...toUpdateInput(created),
        productId: alternateProduct.id,
      } as never),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(
      caller.quotes.update({
        ...toUpdateInput(created),
        customer: {
          type: 'existing',
          customerId: alternateCustomer.id,
        },
      } as never),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(caller.quotes.get({ id: created.id })).resolves.toMatchObject({
      customerId: created.customerId,
      productId: created.productId,
      quotedBasePrice: created.quotedBasePrice,
    });
  });

  test('validates updated discount amounts against the frozen quote snapshot', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const created = await createReadyQuote(caller, context.product.id);

    await context.db.update(products).set({ basePrice: 100 });

    await expect(
      caller.quotes.update({
        ...toUpdateInput(created),
        discountAmount: 500,
      }),
    ).resolves.toMatchObject({
      discountAmount: 500,
      quotedBasePrice: context.product.basePrice,
    });

    await expect(
      caller.quotes.update({
        ...toUpdateInput(created),
        discountAmount: context.product.basePrice + 1,
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
      discountAmount: 150,
      documentNotes: 'Paid before dispatch',
      productId: context.product.id,
    });
    const finalQuote = await salesCaller.quotes.update({
      ...toUpdateInput(createdQuote),
      status: 'accepted',
    });
    const draftQuote = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Beta Civil',
      deliveryPrice: 75,
      depositPercent: 25,
      discountAmount: 25,
      productId: crusherProduct.id,
      salesPersonId: 'another-sales-id',
    });
    const createdCancelledQuote = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Cancelled Works',
      discountAmount: 0,
      productId: context.product.id,
    });
    const cancelledQuote = await salesCaller.quotes.update({
      ...toUpdateInput(createdCancelledQuote),
      status: 'cancelled',
    });
    const job = await supervisorCaller.jobs.create({
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
          documentNotes: 'Paid before dispatch',
          plannedDeliveryDate: '2026-07-05',
          preferredDeliveryDate: '2026-07-01',
          linkedJobs: [
            {
              jobCode: job.code,
              jobId: job.id,
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
          depositPercent: 25,
          productName: 'Crusher Bucket',
        },
      ],
    });

    await expect(
      salesCaller.quotes.list({
        filters: {
          statuses: ['cancelled'],
        },
        page: 1,
        pageSize: 10,
        search: 'Cancelled',
        sortBy: 'createdAt',
        sortDirection: 'desc',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        {
          code: cancelledQuote.code,
          customerCompanyName: 'Cancelled Works',
          status: 'cancelled',
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

describe('quotes.generateDocument', () => {
  test('requires quote update access and returns the created Quote Document', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const productEditorCaller = context.createCaller(mockSession('product-editor'));
    const created = await createReadyQuote(salesCaller, context.product.id);

    await expect(
      productEditorCaller.quotes.generateDocument({
        leadTime: '14 working days',
        quoteId: created.id,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    await expect(
      salesCaller.quotes.generateDocument({
        leadTime: '14 working days',
        quoteId: created.id,
      }),
    ).resolves.toMatchObject({
      contentType: 'application/pdf',
      filename: `${created.code}-rev-1.pdf`,
      metadata: { revision: 1 },
      ownerType: 'quote',
      quoteId: created.id,
    });
  });

  test('maps blocked Quote statuses to a public bad request error', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const cancelled = await salesCaller.quotes.update({
      ...toUpdateInput(created),
      status: 'cancelled',
    });

    await expect(
      salesCaller.quotes.generateDocument({
        leadTime: '14 working days',
        quoteId: cancelled.id,
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Quote Documents can only be generated for draft, sent, or accepted Quotes.',
    });
  });
});

describe('jobs.create with quote links', () => {
  test('creates one job from one accepted quote with stages and locks frozen quote fields', async ({ context }) => {
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

    await expect(
      salesCaller.quotes.update({
        ...toUpdateInput(accepted),
        discountAmount: 100,
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Quote is locked because it already has a Job; discountAmount cannot be changed.',
    });
  });

  test('rejects every frozen quote field after a job exists', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const alternateSalesPersonId = 'locked-sales-id';
    await createSalesUser(context.db, {
      email: 'locked-sales@example.com',
      id: alternateSalesPersonId,
      name: 'Locked Sales',
    });
    const optionalAssembly = await createProductAssembly(context.db, {
      kind: 'optional',
      name: 'Locked optional upgrade',
      price: 125,
      productId: context.product.id,
    });
    const frozenChanges = [
      {
        field: 'deliveryIncluded',
        input: (quote: QuoteDetail) => ({
          ...toUpdateInput(quote),
          deliveryIncluded: false,
        }),
      },
      {
        field: 'deliveryPrice',
        input: (quote: QuoteDetail) => ({
          ...toUpdateInput(quote),
          deliveryPrice: quote.deliveryPrice + 25,
        }),
      },
      {
        field: 'depositPercent',
        input: (quote: QuoteDetail) => ({
          ...toUpdateInput(quote),
          depositPercent: quote.depositPercent + 25,
        }),
      },
      {
        field: 'discountAmount',
        input: (quote: QuoteDetail) => ({
          ...toUpdateInput(quote),
          discountAmount: quote.discountAmount + 25,
        }),
      },
      {
        field: 'salesPersonId',
        input: (quote: QuoteDetail) => ({
          ...toUpdateInput(quote),
          salesPersonId: alternateSalesPersonId,
        }),
      },
      {
        field: 'selectedAssemblies',
        input: (quote: QuoteDetail) => ({
          ...toUpdateInput(quote),
          selectedAssemblies: [{ type: 'catalog' as const, productAssemblyId: optionalAssembly.id }],
        }),
      },
      {
        field: 'status',
        input: (quote: QuoteDetail) => ({
          ...toUpdateInput(quote),
          status: 'sent' as const,
        }),
      },
    ];

    for (const { field, input } of frozenChanges) {
      const created = await createReadyQuote(salesCaller, context.product.id);
      const accepted = await salesCaller.quotes.update({
        ...toUpdateInput(created),
        deliveryIncluded: true,
        deliveryPrice: 100,
        status: 'accepted',
      });
      await supervisorCaller.jobs.create({
        quoteId: accepted.id,
      });

      await expect(salesCaller.quotes.update(input(accepted))).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: `Quote is locked because it already has a Job; ${field} cannot be changed.`,
      });
    }
  });

  test('allows logistics and free-text quote fields after a job exists', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const accepted = await salesCaller.quotes.update({
      ...toUpdateInput(created),
      status: 'accepted',
    });
    await supervisorCaller.jobs.create({
      quoteId: accepted.id,
    });

    await expect(
      salesCaller.quotes.update({
        ...toUpdateInput(accepted),
        notes: 'Post-sale logistics note',
        documentNotes: 'Balance before delivery',
        plannedDeliveryDate: '2026-08-15',
        preferredDeliveryDate: '2026-08-10',
        validUntil: '2026-07-31T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      notes: 'Post-sale logistics note',
      documentNotes: 'Balance before delivery',
      plannedDeliveryDate: '2026-08-15',
      preferredDeliveryDate: '2026-08-10',
      validUntil: '2026-07-31',
    });
  });

  test('rejects a second job from the same quote', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const accepted = await salesCaller.quotes.update({
      ...toUpdateInput(created),
      status: 'accepted',
    });

    await supervisorCaller.jobs.create({
      quoteId: accepted.id,
    });

    await expect(
      supervisorCaller.jobs.create({
        quoteId: accepted.id,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Quote already has a Job.',
    });
  });

  test('rejects a job from a non-accepted quote', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const cancelled = await salesCaller.quotes.update({
      ...toUpdateInput(created),
      status: 'cancelled',
    });

    await expect(
      supervisorCaller.jobs.create({
        quoteId: cancelled.id,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Only accepted quotes can start a Job.',
    });
  });

  test('uses the quote product instead of accepting a supervisor-selected product', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const accepted = await salesCaller.quotes.update({
      ...toUpdateInput(created),
      status: 'accepted',
    });

    const job = await supervisorCaller.jobs.create({
      quoteId: accepted.id,
    });

    expect(job).toMatchObject({
      productId: context.product.id,
      quoteId: accepted.id,
    });
    await expect(
      supervisorCaller.jobs.create({
        productId: '00000000-0000-4000-8000-000000000999',
        quoteId: accepted.id,
      } as never),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

async function createReadyQuote(caller: AppRouterCaller, productId: string) {
  return caller.quotes.create({
    customer: {
      type: 'inline',
      companyName: 'Ready Customer',
    },
    discountAmount: 250,
    notes: null,
    documentNotes: null,
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
    depositPercent = 0,
    deliveryPrice = 0,
    discountAmount,
    documentNotes = null,
    productId,
    salesPersonId = 'test-user-id',
  }: {
    customerCompanyName: string;
    depositPercent?: number;
    deliveryPrice?: number;
    discountAmount: number;
    documentNotes?: string | null;
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
    depositPercent,
    discountAmount,
    notes: null,
    documentNotes,
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
    depositPercent: quote.depositPercent,
    deliveryIncluded: quote.deliveryIncluded,
    deliveryPrice: quote.deliveryPrice,
    discountAmount: quote.discountAmount,
    notes: quote.notes,
    documentNotes: quote.documentNotes,
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

async function createCustomer(db: Db, companyName: string) {
  const [customer] = await db.insert(customers).values({ companyName, email: null }).returning();

  if (!customer) {
    throw new Error('Customer insert did not return a row');
  }

  return customer;
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
