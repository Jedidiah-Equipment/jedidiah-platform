import { listPriorityQuotes } from '@pkg/core';
import {
  auditEvents,
  customers,
  type Db,
  documents,
  jobBays,
  jobSlots,
  jobs,
  productAssemblies,
  productBays,
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
      discountPercent: 10,
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
      discountPercent: 0,
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
        discountPercent: 10,
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
      discountPercent: 5,
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
      discountPercent: 25,
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

  test('returns Product Bays for the Quote Product, including disabled existing Bays', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const enabledBay = await createBay(context.db, {
      id: '00000000-0000-4000-8000-000000000501',
      name: 'A Quote Enabled Product Bay',
    });
    const disabledBay = await createBay(context.db, {
      disabledAt: new Date('2026-06-01T00:00:00.000Z'),
      id: '00000000-0000-4000-8000-000000000502',
      name: 'Z Quote Disabled Product Bay',
    });
    await context.db.insert(productBays).values([
      { bayId: enabledBay.id, defaultWorkingDays: 4, productId: context.product.id },
      { bayId: disabledBay.id, defaultWorkingDays: 6, productId: context.product.id },
    ]);

    const created = await caller.quotes.create({
      customer: {
        type: 'inline',
        companyName: 'Product Bay Customer',
      },
      notes: null,
      documentNotes: null,
      productId: context.product.id,
      salesPersonId: 'test-user-id',
      status: 'accepted',
      validUntil: null,
    });

    await expect(caller.quotes.get({ id: created.id })).resolves.toMatchObject({
      productBays: [
        {
          bay: expect.objectContaining({ disabledAt: null, name: 'A Quote Enabled Product Bay' }),
          bayId: enabledBay.id,
          defaultWorkingDays: 4,
        },
        {
          bay: expect.objectContaining({
            disabledAt: '2026-06-01T00:00:00.000Z',
            name: 'Z Quote Disabled Product Bay',
          }),
          bayId: disabledBay.id,
          defaultWorkingDays: 6,
        },
      ],
    });
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
      discountPercent: 12.5,
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
      discountPercent: 12.5,
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

  test('sets statusChangedAt on a status transition', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const created = await createReadyQuote(caller, context.product.id);
    const baseline = new Date('2026-01-01T00:00:00.000Z');
    await context.db.update(quotes).set({ statusChangedAt: baseline }).where(sql`${quotes.id} = ${created.id}`);

    const updated = await caller.quotes.update({
      ...toUpdateInput(created),
      status: 'sent',
    });

    expect(updated.status).toBe('sent');
    expect(new Date(updated.statusChangedAt).getTime()).toBeGreaterThan(baseline.getTime());
  });

  test('leaves statusChangedAt untouched on edits that do not change status', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const created = await createReadyQuote(caller, context.product.id);
    const baseline = new Date('2026-01-01T00:00:00.000Z');
    await context.db.update(quotes).set({ statusChangedAt: baseline }).where(sql`${quotes.id} = ${created.id}`);

    const updated = await caller.quotes.update({
      ...toUpdateInput(created),
      notes: 'Non-status edit',
    });

    expect(updated.notes).toBe('Non-status edit');
    expect(updated.statusChangedAt).toBe(baseline.toISOString());
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

  test('validates updated discount percents independently of the current product price', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const created = await createReadyQuote(caller, context.product.id);

    await context.db.update(products).set({ basePrice: 100 });

    await expect(
      caller.quotes.update({
        ...toUpdateInput(created),
        discountPercent: 75,
      }),
    ).resolves.toMatchObject({
      discountPercent: 75,
      quotedBasePrice: context.product.basePrice,
    });

    await expect(
      caller.quotes.update({
        ...toUpdateInput(created),
        discountPercent: 101,
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('quotes.list', () => {
  test('searches joined quote fields and keeps totals aligned with filtered rows', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const adminCaller = context.createCaller(mockSession('admin'));
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
      discountPercent: 15,
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
      discountPercent: 25,
      productId: crusherProduct.id,
      salesPersonId: 'another-sales-id',
    });
    const createdCancelledQuote = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Cancelled Works',
      discountPercent: 0,
      productId: context.product.id,
    });
    const cancelledQuote = await salesCaller.quotes.update({
      ...toUpdateInput(createdCancelledQuote),
      status: 'cancelled',
    });
    const job = await adminCaller.jobs.create({
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
          job: {
            jobCode: job.code,
            jobId: job.id,
          },
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
          job: {
            jobCode: job.code,
            jobId: job.id,
          },
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

  test('returns Priority Quotes outside normal quote filters and clears them when a Job exists', async ({
    context,
  }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const adminCaller = context.createCaller(mockSession('admin'));
    const crusherProduct = await createProduct(context.db, {
      modelCode: 'CRUSH-ALERT',
      name: 'Crusher Alert Product',
    });
    await createSalesUser(context.db, {
      email: 'alert-sales@example.com',
      id: 'alert-sales-id',
      name: 'Alert Sales',
    });
    const normalQuote = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Normal Filter Match',
      discountPercent: 5,
      productId: crusherProduct.id,
      salesPersonId: 'alert-sales-id',
    });
    const overdueAlert = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Overdue Alert',
      discountPercent: 10,
      plannedDeliveryDate: '2026-08-01',
      preferredDeliveryDate: '2020-05-20',
      productId: context.product.id,
      status: 'accepted',
    });
    const earliestPreferredAlert = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Preferred Alert',
      discountPercent: 10,
      plannedDeliveryDate: '2026-07-15',
      preferredDeliveryDate: '2026-07-01',
      productId: context.product.id,
      status: 'accepted',
    });
    const firstSingleDateAlert = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Single Date Alert A',
      discountPercent: 10,
      plannedDeliveryDate: '2026-07-10',
      preferredDeliveryDate: null,
      productId: context.product.id,
      status: 'accepted',
    });
    const secondSingleDateAlert = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Single Date Alert B',
      discountPercent: 10,
      plannedDeliveryDate: '2026-07-10',
      preferredDeliveryDate: null,
      productId: context.product.id,
      status: 'accepted',
    });
    const boundaryAlert = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Boundary Alert',
      discountPercent: 10,
      plannedDeliveryDate: '2026-08-11',
      preferredDeliveryDate: null,
      productId: context.product.id,
      status: 'accepted',
    });
    const farFutureQuote = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Far Future Quote',
      discountPercent: 10,
      plannedDeliveryDate: '2026-08-12',
      preferredDeliveryDate: null,
      productId: context.product.id,
      status: 'accepted',
    });
    const blankDateQuote = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Blank Dates Quote',
      discountPercent: 10,
      plannedDeliveryDate: null,
      preferredDeliveryDate: null,
      productId: context.product.id,
      status: 'accepted',
    });
    const sentQuote = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Sent Quote',
      discountPercent: 10,
      plannedDeliveryDate: '2026-07-05',
      preferredDeliveryDate: null,
      productId: context.product.id,
      status: 'sent',
    });
    const clearedByJobQuote = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Cleared By Job Quote',
      discountPercent: 10,
      plannedDeliveryDate: '2026-07-05',
      preferredDeliveryDate: null,
      productId: context.product.id,
      status: 'accepted',
    });
    await adminCaller.jobs.create({
      baySeeds: [],
      quoteId: clearedByJobQuote.id,
    });

    const normalListResult = await salesCaller.quotes.list({
      filters: {
        productId: crusherProduct.id,
        salesPersonId: 'alert-sales-id',
        statuses: ['draft'],
      },
      page: 1,
      pageSize: 1,
      search: 'Normal',
      sortBy: 'customerCompanyName',
      sortDirection: 'desc',
    });
    const result = await listPriorityQuotes({
      clock: () => new Date('2026-06-11T10:00:00.000+02:00'),
      db: context.db,
    });

    expect(normalListResult).toMatchObject({
      total: 1,
      items: [
        {
          code: normalQuote.code,
          customerCompanyName: 'Normal Filter Match',
          status: 'draft',
        },
      ],
    });
    expect(normalListResult).not.toHaveProperty('jobStartAlerts');
    expect(result.map((quote) => quote.code)).toEqual([
      overdueAlert.code,
      earliestPreferredAlert.code,
      firstSingleDateAlert.code,
      secondSingleDateAlert.code,
      boundaryAlert.code,
    ]);
    expect(result).toEqual([
      expect.objectContaining({
        code: overdueAlert.code,
        earliestDeliveryDate: '2020-05-20',
      }),
      expect.objectContaining({
        code: earliestPreferredAlert.code,
        earliestDeliveryDate: '2026-07-01',
      }),
      expect.objectContaining({
        code: firstSingleDateAlert.code,
        earliestDeliveryDate: '2026-07-10',
      }),
      expect.objectContaining({
        code: secondSingleDateAlert.code,
        earliestDeliveryDate: '2026-07-10',
      }),
      expect.objectContaining({
        code: boundaryAlert.code,
        earliestDeliveryDate: '2026-08-11',
      }),
    ]);
    expect(result.map((quote) => quote.code)).not.toEqual(
      expect.arrayContaining([blankDateQuote.code, clearedByJobQuote.code, farFutureQuote.code, sentQuote.code]),
    );

    const matchingNormalListResult = await salesCaller.quotes.list({
      filters: {
        statuses: ['accepted'],
      },
      page: 1,
      pageSize: 10,
      search: 'Overdue',
      sortBy: 'code',
      sortDirection: 'asc',
    });
    const endpointResult = await salesCaller.quotes.priorityList();

    expect(matchingNormalListResult.items.map((quote) => quote.code)).toContain(overdueAlert.code);
    expect(result.map((quote) => quote.code)).toContain(overdueAlert.code);
    expect(endpointResult.map((quote) => quote.code)).toContain(overdueAlert.code);
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

describe('quotes.summaryByStatus', () => {
  test('requires quote read access and returns a zero-filled status summary', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const productEditorCaller = context.createCaller(mockSession('procurement-manager'));

    await expect(productEditorCaller.quotes.summaryByStatus()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(salesCaller.quotes.summaryByStatus()).resolves.toEqual({
      items: [
        { count: 0, status: 'draft' },
        { count: 0, status: 'sent' },
        { count: 0, status: 'accepted' },
        { count: 0, status: 'rejected' },
        { count: 0, status: 'cancelled' },
      ],
    });
  });
});

describe('quotes.pipelineSummary', () => {
  test('requires quote read access and aggregates sent pipeline value with decision counts', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const productEditorCaller = context.createCaller(mockSession('procurement-manager'));

    await expect(productEditorCaller.quotes.pipelineSummary()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    await createNamedQuote(salesCaller, {
      customerCompanyName: 'Pipeline Sent Customer',
      deliveryPrice: 100,
      discountPercent: 10,
      productId: context.product.id,
      status: 'sent',
    });
    await createNamedQuote(salesCaller, {
      customerCompanyName: 'Pipeline Accepted Customer',
      discountPercent: 0,
      productId: context.product.id,
      status: 'accepted',
    });
    await createNamedQuote(salesCaller, {
      customerCompanyName: 'Pipeline Cancelled Customer',
      discountPercent: 0,
      productId: context.product.id,
      status: 'cancelled',
    });
    // An accepted decision older than the 90-day window stays out of the win-rate counts.
    const staleDecision = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Pipeline Old Decision Customer',
      discountPercent: 0,
      productId: context.product.id,
      status: 'rejected',
    });
    await context.db
      .update(quotes)
      .set({ statusChangedAt: daysAgo(91) })
      .where(sql`${quotes.id} = ${staleDecision.id}`);

    // Base 1000 + delivery 100 - 10% discount = 1000 for the single sent quote, freshly sent.
    await expect(salesCaller.quotes.pipelineSummary()).resolves.toEqual({
      accepted90dCount: 1,
      newlySent30dValue: 1000,
      openSentCount: 1,
      openSentValue: 1000,
      rejected90dCount: 0,
    });

    // Pushing the sent transition outside the 30-day window keeps the quote in the open pipeline only.
    const [sentRow] = await context.db.select({ id: quotes.id }).from(quotes).where(sql`${quotes.status} = 'sent'`);
    await context.db
      .update(quotes)
      .set({ statusChangedAt: daysAgo(31) })
      .where(sql`${quotes.id} = ${sentRow?.id}`);

    await expect(salesCaller.quotes.pipelineSummary()).resolves.toMatchObject({
      newlySent30dValue: 0,
      openSentCount: 1,
      openSentValue: 1000,
    });
  });
});

describe('quotes.weeklyFlow', () => {
  test('requires quote read access and returns created and accepted weekly series', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const productEditorCaller = context.createCaller(mockSession('procurement-manager'));

    await expect(productEditorCaller.quotes.weeklyFlow()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    await createNamedQuote(salesCaller, {
      customerCompanyName: 'Flow Created Customer',
      discountPercent: 0,
      productId: context.product.id,
      status: 'draft',
    });
    await createNamedQuote(salesCaller, {
      customerCompanyName: 'Flow Accepted Customer',
      discountPercent: 0,
      productId: context.product.id,
      status: 'accepted',
    });

    const result = await salesCaller.quotes.weeklyFlow();

    expect(result.items).toHaveLength(12);
    const createdTotal = result.items.reduce((total, item) => total + item.createdCount, 0);
    const acceptedTotal = result.items.reduce((total, item) => total + item.acceptedCount, 0);
    expect(createdTotal).toBe(2);
    expect(acceptedTotal).toBe(1);
  });
});

describe('quotes.staleSent', () => {
  test('requires quote read access and lists sent quotes oldest-first with staleness', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const productEditorCaller = context.createCaller(mockSession('procurement-manager'));

    await expect(productEditorCaller.quotes.staleSent()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    const freshSent = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Fresh Sent Customer',
      discountPercent: 0,
      productId: context.product.id,
      status: 'sent',
    });
    const oldSent = await createNamedQuote(salesCaller, {
      customerCompanyName: 'Old Sent Customer',
      deliveryPrice: 50,
      discountPercent: 0,
      productId: context.product.id,
      status: 'sent',
    });
    await createNamedQuote(salesCaller, {
      customerCompanyName: 'Accepted Customer',
      discountPercent: 0,
      productId: context.product.id,
      status: 'accepted',
    });
    await context.db
      .update(quotes)
      .set({ statusChangedAt: daysAgo(14) })
      .where(sql`${quotes.id} = ${oldSent.id}`);

    const result = await salesCaller.quotes.staleSent();

    expect(result.items.map((item) => item.id)).toEqual([oldSent.id, freshSent.id]);
    expect(result.items[0]).toMatchObject({
      customerCompanyName: 'Old Sent Customer',
      sentDaysAgo: 14,
      totalValue: 1050,
    });
    expect(result.items[1]).toMatchObject({
      customerCompanyName: 'Fresh Sent Customer',
      sentDaysAgo: 0,
      totalValue: 1000,
    });
  });
});

describe('quotes.productBayAvailability', () => {
  test('allows sales users to read quote-scoped Product Bay availability without full job schedule access', async ({
    context,
  }) => {
    const caller = context.createCaller(mockSession('sales'));
    const quote = await createReadyQuote(caller, context.product.id);
    const quickBay = await createBay(context.db, {
      id: '00000000-0000-4000-8000-000000000531',
      name: 'Quote Quick Bay',
      scheduleOrigin: '2026-06-10',
    });
    const slowerBay = await createBay(context.db, {
      id: '00000000-0000-4000-8000-000000000532',
      name: 'Quote Slower Bay',
      scheduleOrigin: '2026-06-10',
    });
    const disabledBay = await createBay(context.db, {
      disabledAt: new Date('2026-06-01T00:00:00.000Z'),
      id: '00000000-0000-4000-8000-000000000533',
      name: 'Quote Disabled Bay',
      scheduleOrigin: '2026-06-10',
    });
    await context.db.insert(productBays).values([
      { bayId: quickBay.id, defaultWorkingDays: 2, productId: context.product.id },
      { bayId: slowerBay.id, defaultWorkingDays: 4, productId: context.product.id },
      { bayId: disabledBay.id, defaultWorkingDays: 9, productId: context.product.id },
    ]);
    await context.db.insert(jobSlots).values([
      { bayId: quickBay.id, durationDays: 1, kind: 'idle', label: null, sequence: 1 },
      { bayId: slowerBay.id, durationDays: 3, kind: 'idle', label: null, sequence: 1 },
      { bayId: disabledBay.id, durationDays: 8, kind: 'idle', label: null, sequence: 1 },
    ]);
    const alternateProduct = await createProduct(context.db, {
      modelCode: 'ALT-AVAIL-001',
      name: 'Alternate Availability Product',
    });
    const alternateBay = await createBay(context.db, {
      id: '00000000-0000-4000-8000-000000000534',
      name: 'Alternate Product Bay',
      scheduleOrigin: '2026-06-10',
    });
    await context.db
      .insert(productBays)
      .values({ bayId: alternateBay.id, defaultWorkingDays: 1, productId: alternateProduct.id });

    const availability = await caller.quotes.productBayAvailability({ quoteId: quote.id });

    expect(availability).toMatchObject({
      bays: [
        expect.objectContaining({ bayId: quickBay.id, name: 'Quote Quick Bay', waitWorkingDays: expect.any(Number) }),
        expect.objectContaining({ bayId: slowerBay.id, name: 'Quote Slower Bay', waitWorkingDays: expect.any(Number) }),
      ],
      buildTimeDays: context.product.buildTimeDays,
      defaultLeadTimeWorkingDays: expect.any(Number),
    });
    expect(availability.bays.map((bay) => bay.bayId)).not.toContain(alternateBay.id);
    await expect(caller.jobs.listBays()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('rejects missing Quotes instead of exposing arbitrary Product Bay availability', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    await expect(
      caller.quotes.productBayAvailability({ quoteId: '00000000-0000-4000-8000-000000000999' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('quotes.getProductBrochure', () => {
  test('returns the latest Product brochure through quote read access', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const productEditorCaller = context.createCaller(mockSession('procurement-manager'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const older = await createProductDocument(context.db, {
      filename: 'Old Brochure.pdf',
      productId: context.product.id,
      type: 'brochure',
    });
    const newer = await createProductDocument(context.db, {
      filename: 'New Brochure.pdf',
      productId: context.product.id,
      type: 'brochure',
    });
    await createProductDocument(context.db, {
      filename: 'Newest Part Book.pdf',
      productId: context.product.id,
      type: 'part_book',
    });
    await context.db
      .update(documents)
      .set({ createdAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(sql`${documents.id} = ${older.id}`);
    await context.db
      .update(documents)
      .set({ createdAt: new Date('2026-01-02T00:00:00.000Z') })
      .where(sql`${documents.id} = ${newer.id}`);

    await expect(productEditorCaller.quotes.getProductBrochure({ quoteId: created.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(salesCaller.quotes.getProductBrochure({ quoteId: created.id })).resolves.toMatchObject({
      filename: 'New Brochure.pdf',
      id: newer.id,
      metadata: { type: 'brochure' },
      ownerType: 'product',
      productId: context.product.id,
    });
  });

  test('returns null when the Quote Product has no brochure', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const created = await createReadyQuote(salesCaller, context.product.id);

    await expect(salesCaller.quotes.getProductBrochure({ quoteId: created.id })).resolves.toBeNull();
  });
});

describe('quotes.generateDocument', () => {
  test('requires quote update access and returns the created Quote Document', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const productEditorCaller = context.createCaller(mockSession('procurement-manager'));
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
      document: {
        contentType: 'application/pdf',
        filename: `${created.code}-rev-1.pdf`,
        metadata: { revision: 1 },
        ownerType: 'quote',
        quoteId: created.id,
      },
      warnings: [
        {
          code: 'quote_document.product_brochure_missing',
          message:
            'No PDF brochure is attached to this Quote Product, so the Quote Document was generated without one.',
        },
      ],
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
  test('creates one job from one accepted quote and locks frozen quote fields', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const adminCaller = context.createCaller(mockSession('admin'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const accepted = await salesCaller.quotes.update({
      ...toUpdateInput(created),
      status: 'accepted',
    });

    await expect(adminCaller.quotes.get({ id: accepted.id })).resolves.toMatchObject({
      id: accepted.id,
      status: 'accepted',
    });

    const job = await adminCaller.jobs.create({
      quoteId: accepted.id,
    });
    const jobRows = await context.db.select().from(jobs);

    expect(job).toMatchObject({
      productId: context.product.id,
      quoteId: accepted.id,
    });
    expect(jobRows).toHaveLength(1);

    await expect(
      salesCaller.quotes.update({
        ...toUpdateInput(accepted),
        discountPercent: 10,
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Quote is locked because it already has a Job; discountPercent cannot be changed.',
    });
  });

  test('rejects every frozen quote field after a job exists', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const adminCaller = context.createCaller(mockSession('admin'));
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
        field: 'discountPercent',
        input: (quote: QuoteDetail) => ({
          ...toUpdateInput(quote),
          discountPercent: quote.discountPercent + 25,
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
      await adminCaller.jobs.create({
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
    const adminCaller = context.createCaller(mockSession('admin'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const accepted = await salesCaller.quotes.update({
      ...toUpdateInput(created),
      status: 'accepted',
    });
    await adminCaller.jobs.create({
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
    const adminCaller = context.createCaller(mockSession('admin'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const accepted = await salesCaller.quotes.update({
      ...toUpdateInput(created),
      status: 'accepted',
    });

    await adminCaller.jobs.create({
      quoteId: accepted.id,
    });

    await expect(
      adminCaller.jobs.create({
        quoteId: accepted.id,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Quote already has a Job.',
    });
  });

  test('rejects a job from a non-accepted quote', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const adminCaller = context.createCaller(mockSession('admin'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const cancelled = await salesCaller.quotes.update({
      ...toUpdateInput(created),
      status: 'cancelled',
    });

    await expect(
      adminCaller.jobs.create({
        quoteId: cancelled.id,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Only accepted quotes can start a Job.',
    });
  });

  test('uses the quote product instead of accepting a admin-selected product', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const adminCaller = context.createCaller(mockSession('admin'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const accepted = await salesCaller.quotes.update({
      ...toUpdateInput(created),
      status: 'accepted',
    });

    const job = await adminCaller.jobs.create({
      quoteId: accepted.id,
    });

    expect(job).toMatchObject({
      productId: context.product.id,
      quoteId: accepted.id,
    });
    await expect(
      adminCaller.jobs.create({
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
    discountPercent: 25,
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
    discountPercent,
    documentNotes = null,
    plannedDeliveryDate = '2026-07-05',
    productId,
    preferredDeliveryDate = '2026-07-01',
    salesPersonId = 'test-user-id',
    status = 'draft',
  }: {
    customerCompanyName: string;
    depositPercent?: number;
    deliveryPrice?: number;
    discountPercent: number;
    documentNotes?: string | null;
    plannedDeliveryDate?: string | null;
    productId: string;
    preferredDeliveryDate?: string | null;
    salesPersonId?: string;
    status?: 'accepted' | 'cancelled' | 'draft' | 'rejected' | 'sent';
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
    discountPercent,
    notes: null,
    documentNotes,
    plannedDeliveryDate,
    preferredDeliveryDate,
    productId,
    salesPersonId,
    status,
    validUntil: '2026-06-30',
  });
}

function toUpdateInput(quote: QuoteDetail) {
  return {
    id: quote.id,
    depositPercent: quote.depositPercent,
    deliveryIncluded: quote.deliveryIncluded,
    deliveryPrice: quote.deliveryPrice,
    discountPercent: quote.discountPercent,
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

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
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

async function createProductDocument(
  db: Db,
  input: {
    contentType?: string;
    filename: string;
    productId: string;
    type: 'brochure' | 'part_book' | 'sop';
  },
) {
  const [document] = await db
    .insert(documents)
    .values({
      byteSize: 8,
      contentType: input.contentType ?? 'application/pdf',
      filename: input.filename,
      metadata: { type: input.type },
      ownerType: 'product',
      productId: input.productId,
      storageKey: `documents/product/${input.productId}/${input.filename}`,
      uploaderUserId: 'test-user-id',
    })
    .returning({ id: documents.id });

  if (!document) {
    throw new Error('Document insert did not return a row');
  }

  return document;
}

async function createProductAssembly(
  db: Db,
  values: Omit<typeof productAssemblies.$inferInsert, 'displayOrder'> & { displayOrder?: number },
) {
  const [assembly] = await db
    .insert(productAssemblies)
    .values({ displayOrder: 0, ...values })
    .returning();

  if (!assembly) {
    throw new Error('Product assembly insert did not return a row');
  }

  return assembly;
}

async function createBay(
  db: Db,
  values: {
    disabledAt?: Date | null;
    id: string;
    name: string;
    scheduleOrigin?: string;
  },
) {
  const [bay] = await db
    .insert(jobBays)
    .values({
      department: 'fabrication',
      disabledAt: null,
      scheduleOrigin: '2026-01-01',
      ...values,
    })
    .returning();

  if (!bay) {
    throw new Error('Bay insert did not return a row');
  }

  return bay;
}
