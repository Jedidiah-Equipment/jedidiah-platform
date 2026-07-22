import {
  auditEvents,
  customers,
  type Db,
  jobBayCalendarExceptions,
  jobBays,
  jobSlots,
  jobs,
  productAssemblies,
  productBays,
  products,
  quotes,
  user,
  workingCalendarOffDays,
} from '@pkg/db';
import { addDateOnlyDays, addJobSlotDuration, getPlantDateNow, priceQuote } from '@pkg/domain';
import {
  DateIso,
  DateOnlyIso,
  formatJobCode,
  QuoteCreateInput,
  type QuoteDetail,
  type QuoteStatus,
  QuoteUpdateInput,
} from '@pkg/schema';
import { and, asc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { getJob } from '../jobs/job-read-service.js';
import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import {
  getQuote,
  getQuoteProductBayAvailability,
  listPriorityQuotes,
  listQuoteSalespeople,
  listQuotes,
} from './quote-read-service.js';
import { cancelQuote, createQuote as createQuoteService, patchQuote, updateQuote } from './quote-service.js';

const test = createTester(async ({ db }) => {
  const now = new Date();
  const rangeId = await createProductRangeFixture(db);
  const [salesPerson] = await db
    .insert(user)
    .values({
      createdAt: now,
      email: 'sales@example.com',
      emailVerified: true,
      id: 'sales-user-id',
      name: 'Sales User',
      role: 'sales',
      updatedAt: now,
    })
    .returning();
  const [customer] = await db.insert(customers).values({ companyName: 'Acme Mining', email: null }).returning();
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      modelCode: 'QUOTE-SUMMARY-001',
      name: 'Quote Summary Product',
      rangeId,
    })
    .returning();

  if (!salesPerson || !customer || !product) {
    throw new Error('Quote status summary test setup did not return required rows');
  }

  return {
    customer,
    product,
    salesPerson,
  };
});

describe('getQuote', () => {
  test('returns Product Bays for the quote Product, including disabled existing Bays', async ({ context }) => {
    const enabledBay = await createBay(context.db, {
      id: '00000000-0000-4000-8000-000000000401',
      name: 'A Enabled Product Bay',
    });
    const disabledBay = await createBay(context.db, {
      disabledAt: new Date('2026-06-01T00:00:00.000Z'),
      id: '00000000-0000-4000-8000-000000000402',
      name: 'Z Disabled Product Bay',
    });
    await context.db.insert(productBays).values([
      { bayId: enabledBay.id, defaultWorkingDays: 3, productId: context.product.id },
      { bayId: disabledBay.id, defaultWorkingDays: 5, productId: context.product.id },
    ]);
    const [quote] = await context.db
      .insert(quotes)
      .values({
        customerId: context.customer.id,
        productId: context.product.id,
        quotedBasePrice: 1000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: context.salesPerson.id,
        status: 'accepted',
      })
      .returning();

    if (!quote) {
      throw new Error('Quote insert did not return a row');
    }

    await expect(getQuote({ db: context.db, id: quote.id })).resolves.toMatchObject({
      product: {
        bays: [
          {
            bay: expect.objectContaining({ disabledAt: null, name: 'A Enabled Product Bay' }),
            bayId: enabledBay.id,
            defaultWorkingDays: 3,
          },
          {
            bay: expect.objectContaining({ disabledAt: '2026-06-01T00:00:00.000Z', name: 'Z Disabled Product Bay' }),
            bayId: disabledBay.id,
            defaultWorkingDays: 5,
          },
        ],
      },
    });
  });

  test('returns an empty Product Bay list when the quote Product has none', async ({ context }) => {
    const [quote] = await context.db
      .insert(quotes)
      .values({
        customerId: context.customer.id,
        productId: context.product.id,
        quotedBasePrice: 1000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: context.salesPerson.id,
        status: 'accepted',
      })
      .returning();

    if (!quote) {
      throw new Error('Quote insert did not return a row');
    }

    await expect(getQuote({ db: context.db, id: quote.id })).resolves.toMatchObject({ product: { bays: [] } });
  });

  test('returns the single linked Job through the quote compatibility array', async ({ context }) => {
    const quote = await createQuote(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      status: 'accepted',
    });
    const [job] = await context.db
      .insert(jobs)
      .values({
        productId: context.product.id,
        productSerialNumber: 'QUOTE-SUMMARY-001-26-001',
        productSerialPrefix: 'QUOTE-SUMMARY-001',
        productSerialSequence: 1,
        productSerialYear: 26,
        quoteId: quote.id,
      })
      .returning();

    if (!job) {
      throw new Error('Job insert did not return a row');
    }

    await expect(getQuote({ db: context.db, id: quote.id })).resolves.toMatchObject({
      job: { jobCode: formatJobCode(job.code), jobId: job.id },
    });
  });
});

describe('inline quote customer', () => {
  test('persists contact details on the inline-created Customer and surfaces them on the quote detail', async ({
    context,
  }) => {
    const created = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: {
          type: 'inline',
          companyName: 'Brookside Farm',
          contactPerson: '  Tony Jones  ',
          email: 'Tony@Brookside.example',
          phone: '082 000 0000',
          address: '12 Farm Road',
        },
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    const [customer] = await context.db.select().from(customers).where(eq(customers.id, created.customerId));

    expect(customer).toMatchObject({
      address: '12 Farm Road',
      companyName: 'Brookside Farm',
      contactPerson: 'Tony Jones',
      email: 'tony@brookside.example',
      phone: '082 000 0000',
    });
    expect(created).toMatchObject({
      customerContactPerson: 'Tony Jones',
      customerEmail: 'tony@brookside.example',
    });
  });

  test('defaults inline Customer contact details to null when omitted', async ({ context }) => {
    const created = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'inline', companyName: 'Sparse Farm' },
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    const [customer] = await context.db.select().from(customers).where(eq(customers.id, created.customerId));

    expect(customer).toMatchObject({
      address: null,
      companyName: 'Sparse Farm',
      contactPerson: null,
      email: null,
      phone: null,
    });
  });
});

describe('quote collections', () => {
  test('records only the changed selected assembly in quote audit events', async ({ context }) => {
    const [optionalAssembly] = await context.db
      .insert(productAssemblies)
      .values({
        displayOrder: 0,
        kind: 'optional',
        name: 'Bugle eye hitch',
        price: 8500,
        productId: context.product.id,
      })
      .returning();

    if (!optionalAssembly) {
      throw new Error('Product assembly insert did not return a row');
    }

    const quote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    await updateQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: buildQuoteUpdateInput(quote, {
        selectedAssemblies: [{ type: 'catalog', productAssemblyId: optionalAssembly.id }],
      }),
    });

    const events = await context.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityType, 'quote'), eq(auditEvents.entityId, quote.id)));
    const updateEvent = events.find((event) => event.action === 'updated');

    expect(updateEvent?.changes).toEqual({
      'selectedAssembly:Bugle eye hitch': {
        from: null,
        to: { productAssemblyId: optionalAssembly.id, quotedName: 'Bugle eye hitch', quotedPrice: 8500 },
      },
    });
  });
});

describe('custom quotes', () => {
  test('creates a custom quote with entered commercial facts, work items, and no product facts', async ({
    context,
  }) => {
    const created = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: {
          kind: 'custom',
          workTitle: 'Hydraulic repair',
          basePrice: 2500,
          hourlyRate: 850,
          workItems: [{ name: 'Travel', hours: 0, parts: [{ name: 'Fuel', quantity: 2, unitPrice: 150 }] }],
        },
        salesPersonId: context.salesPerson.id,
        status: 'sent',
      }),
    });
    if (created.kind !== 'custom') throw new Error('Expected a Custom Quote');

    expect(created).toMatchObject({
      kind: 'custom',
      productId: null,
      product: null,
      quotedBasePrice: 2500,
      quotedCurrencyCode: 'ZAR',
      selectedAssemblies: [],
      workTitle: 'Hydraulic repair',
    });
    expect(created.workItems).toMatchObject([
      { name: 'Travel', hours: 0, parts: [{ name: 'Fuel', quantity: 2, unitPrice: 150 }] },
    ]);
  });

  test('rejects selected assemblies on custom quote create and update', async ({ context }) => {
    await expect(
      createQuoteService({
        actorUserId: context.salesPerson.id,
        db: context.db,
        input: QuoteCreateInput.parse({
          customer: { type: 'existing', customerId: context.customer.id },
          offering: { kind: 'custom', workTitle: 'Pump rebuild', basePrice: 3000, hourlyRate: 850 },
          salesPersonId: context.salesPerson.id,
          selectedAssemblies: [{ type: 'catalog', productAssemblyId: '00000000-0000-4000-8000-000000000901' }],
          status: 'draft',
        }),
      }),
    ).rejects.toThrow('Custom Quotes cannot have Selected Assemblies.');

    const customQuote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'custom', workTitle: 'Pump rebuild', basePrice: 3000, hourlyRate: 850 },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    await expect(
      updateQuote({
        actorUserId: context.salesPerson.id,
        db: context.db,
        input: buildQuoteUpdateInput(customQuote, {
          selectedAssemblies: [{ type: 'catalog', productAssemblyId: '00000000-0000-4000-8000-000000000901' }],
        }),
      }),
    ).rejects.toThrow('Custom Quotes cannot have Selected Assemblies.');
  });

  test('keeps custom commercial fields editable before acceptance even when a job exists', async ({ context }) => {
    const customQuote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'custom', workTitle: 'Draft repair', basePrice: 1500, hourlyRate: 850 },
        salesPersonId: context.salesPerson.id,
        status: 'sent',
      }),
    });
    await context.db.insert(jobs).values({
      productId: null,
      productSerialNumber: null,
      productSerialPrefix: null,
      productSerialSequence: null,
      productSerialYear: null,
      quoteId: customQuote.id,
    });

    const updated = await updateQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: buildQuoteUpdateInput(customQuote, {
        discountPercent: 5,
        offering: {
          kind: 'custom',
          basePrice: 1750,
          hourlyRate: 900,
          workTitle: 'Draft repair revised',
          workItems: [{ name: 'Travel', hours: 1, parts: [] }],
        },
      }),
    });
    if (updated.kind !== 'custom') throw new Error('Expected a Custom Quote');

    expect(updated).toMatchObject({
      discountPercent: 5,
      hourlyRate: 900,
      quotedBasePrice: 1750,
      workTitle: 'Draft repair revised',
    });
    expect(updated.workItems).toMatchObject([{ name: 'Travel', hours: 1, parts: [] }]);
  });

  test('rejects clearing a custom quote work title at the update input boundary', async ({ context }) => {
    const customQuote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'custom', workTitle: 'Repair work', basePrice: 1500, hourlyRate: 850 },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    expect(() =>
      buildQuoteUpdateInput(customQuote, {
        offering: { kind: 'custom', basePrice: 1500, hourlyRate: 850, workTitle: '' },
      }),
    ).toThrow();
  });

  test('rejects update offering kind changes', async ({ context }) => {
    const productQuote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    await expect(
      updateQuote({
        actorUserId: context.salesPerson.id,
        db: context.db,
        input: buildQuoteUpdateInput(productQuote, {
          offering: { kind: 'custom', basePrice: 1500, hourlyRate: 850, workTitle: 'Repair work' },
        }),
      }),
    ).rejects.toThrow('Quote offering kind cannot be changed.');
  });

  test('locks custom commercial fields after acceptance but still allows post-lock notes', async ({ context }) => {
    const customQuote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'custom', workTitle: 'Accepted repair', basePrice: 2200, hourlyRate: 850 },
        salesPersonId: context.salesPerson.id,
        status: 'accepted',
      }),
    });

    await expect(
      updateQuote({
        actorUserId: context.salesPerson.id,
        db: context.db,
        input: buildQuoteUpdateInput(customQuote, {
          offering: { kind: 'custom', basePrice: 2300, hourlyRate: 850, workTitle: 'Accepted repair' },
        }),
      }),
    ).rejects.toThrow('Quote is locked because it has been accepted; quotedBasePrice cannot be changed.');

    const updated = await updateQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: buildQuoteUpdateInput(customQuote, { notes: 'Accepted custom follow-up' }),
    });

    expect(updated.notes).toBe('Accepted custom follow-up');
  });

  test('rejects product bay availability for custom quotes', async ({ context }) => {
    const customQuote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'custom', workTitle: 'Availability-free repair', basePrice: 1800, hourlyRate: 850 },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    await expect(
      getQuoteProductBayAvailability({
        db: context.db,
        input: { quoteId: customQuote.id },
      }),
    ).rejects.toThrow('Product Bay availability is only available for Product Quotes.');
  });

  test('includes accepted custom quotes in the priority quote alert list', async ({ context }) => {
    const customQuote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'custom', workTitle: 'Priority repair', basePrice: 1800, hourlyRate: 850 },
        plannedDeliveryDate: '2026-02-15',
        salesPersonId: context.salesPerson.id,
        status: 'accepted',
      }),
    });

    await expect(
      listPriorityQuotes({
        clock: () => new Date('2026-01-15T10:00:00.000+02:00'),
        db: context.db,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: customQuote.id, kind: 'custom', workTitle: 'Priority repair' })]);
  });

  test('lists custom quotes by kind, work-title search, and product-name sort', async ({ context }) => {
    const customQuote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'custom', workTitle: 'Axle rebuild', basePrice: 1800, hourlyRate: 850 },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });
    await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    await expect(
      listQuotes({
        db: context.db,
        input: {
          filters: { kind: 'custom', statuses: [] },
          page: 1,
          pageSize: 10,
          search: 'Axle',
          sortBy: 'productName',
          sortDirection: 'asc',
        },
      }),
    ).resolves.toMatchObject({
      items: [{ id: customQuote.id, kind: 'custom', workTitle: 'Axle rebuild' }],
      total: 1,
    });
  });

  test('records custom quote commercial facts in audit events', async ({ context }) => {
    const customQuote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'custom', workTitle: 'Audit repair', basePrice: 2000, hourlyRate: 850 },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    await updateQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: buildQuoteUpdateInput(customQuote, {
        offering: { kind: 'custom', basePrice: 2100, hourlyRate: 900, workTitle: 'Audit repair revised' },
      }),
    });

    const events = await context.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityType, 'quote'), eq(auditEvents.entityId, customQuote.id)));
    const createEvent = events.find((event) => event.action === 'created');
    const updateEvent = events.find((event) => event.action === 'updated');

    expect(createEvent?.changes).toMatchObject({
      hourlyRate: { from: null, to: 850 },
      kind: { from: null, to: 'custom' },
      workTitle: { from: null, to: 'Audit repair' },
    });
    expect(updateEvent?.changes).toMatchObject({
      hourlyRate: { from: 850, to: 900 },
      quotedBasePrice: { from: 2000, to: 2100 },
      workTitle: { from: 'Audit repair', to: 'Audit repair revised' },
    });
  });
});

describe('cancelled quotes', () => {
  test('updateQuote can cancel an unlocked quote, keeps lock-editable fields writable, and cannot leave cancelled', async ({
    context,
  }) => {
    const quote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });
    const cancelled = await updateQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: buildQuoteUpdateInput(quote, { status: 'cancelled' }),
    });

    const annotated = await updateQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: buildQuoteUpdateInput(cancelled, {
        documentNotes: 'Cancelled document note',
        notes: 'Cancelled internal note',
        plannedDeliveryDate: DateOnlyIso.parse('2026-08-01'),
        preferredDeliveryDate: DateOnlyIso.parse('2026-08-08'),
        validUntil: DateIso.parse('2026-08-15'),
      }),
    });

    expect(annotated).toMatchObject({
      documentNotes: 'Cancelled document note',
      notes: 'Cancelled internal note',
      plannedDeliveryDate: '2026-08-01',
      preferredDeliveryDate: '2026-08-08',
      status: 'cancelled',
      validUntil: '2026-08-15',
    });
    await expect(getQuote({ db: context.db, id: quote.id })).resolves.toMatchObject({
      id: quote.id,
      status: 'cancelled',
    });
    await expect(
      updateQuote({
        actorUserId: context.salesPerson.id,
        db: context.db,
        input: buildQuoteUpdateInput(annotated, { status: 'draft' }),
      }),
    ).rejects.toThrow('Quote is locked because it has been cancelled; status cannot be changed.');
  });

  test('patchQuote can cancel an unlocked quote, keeps lock-editable fields writable, and cannot leave cancelled', async ({
    context,
  }) => {
    const quote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'custom', basePrice: 1800, hourlyRate: 850, workTitle: 'Cancelled repair' },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });
    const cancelled = await patchQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: { id: quote.id, status: 'cancelled' },
    });

    const annotated = await patchQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: {
        documentNotes: 'Cancelled document note',
        id: quote.id,
        notes: 'Cancelled internal note',
        plannedDeliveryDate: DateOnlyIso.parse('2026-08-01'),
        preferredDeliveryDate: DateOnlyIso.parse('2026-08-08'),
        validUntil: DateIso.parse('2026-08-15'),
      },
    });

    expect(cancelled.status).toBe('cancelled');
    expect(annotated).toMatchObject({
      documentNotes: 'Cancelled document note',
      notes: 'Cancelled internal note',
      plannedDeliveryDate: '2026-08-01',
      preferredDeliveryDate: '2026-08-08',
      status: 'cancelled',
      validUntil: '2026-08-15',
    });
    await expect(
      patchQuote({
        actorUserId: context.salesPerson.id,
        db: context.db,
        input: { id: quote.id, status: 'sent' },
      }),
    ).rejects.toThrow('Quote is locked because it has been cancelled; status cannot be changed.');
  });
});

describe('listQuotes', () => {
  test('excludes cancelled quotes when no status filter is applied', async ({ context }) => {
    const visible = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });
    await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'cancelled',
      }),
    });

    await expect(
      listQuotes({
        db: context.db,
        input: {
          filters: { statuses: [] },
          page: 1,
          pageSize: 10,
          search: '',
          sortBy: 'createdAt',
          sortDirection: 'asc',
        },
      }),
    ).resolves.toMatchObject({ items: [{ id: visible.id }], total: 1 });
  });

  test('includes cancelled quotes when the cancelled status filter is applied', async ({ context }) => {
    const cancelled = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'cancelled',
      }),
    });
    await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    await expect(
      listQuotes({
        db: context.db,
        input: {
          filters: { statuses: ['cancelled'] },
          page: 1,
          pageSize: 10,
          search: '',
          sortBy: 'createdAt',
          sortDirection: 'asc',
        },
      }),
    ).resolves.toMatchObject({ items: [{ id: cancelled.id, status: 'cancelled' }], total: 1 });
  });
});

describe('patchQuote', () => {
  test('full-replaces selected assemblies when the collection is supplied', async ({ context }) => {
    const [optionalAssembly] = await context.db
      .insert(productAssemblies)
      .values({
        displayOrder: 0,
        kind: 'optional',
        name: 'Calibration package',
        price: 650,
        productId: context.product.id,
      })
      .returning();

    if (!optionalAssembly) {
      throw new Error('Product assembly insert did not return a row');
    }

    const quote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    const updated = await patchQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: {
        id: quote.id,
        selectedAssemblies: [{ type: 'catalog', productAssemblyId: optionalAssembly.id }],
      },
    });

    expect(updated.selectedAssemblies).toMatchObject([
      {
        productAssemblyId: optionalAssembly.id,
        quotedName: 'Calibration package',
        quotedPrice: 650,
      },
    ]);
  });

  test('written pricing facts price the read-back Quote through the persisted Quote Pricing seam', async ({
    context,
  }) => {
    const [optionalAssembly] = await context.db
      .insert(productAssemblies)
      .values({
        displayOrder: 0,
        kind: 'optional',
        name: 'Winch package',
        price: 500,
        productId: context.product.id,
      })
      .returning();

    if (!optionalAssembly) {
      throw new Error('Product assembly insert did not return a row');
    }

    const quote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });
    await updateQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: buildQuoteUpdateInput(quote, {
        deliveryIncluded: false,
        deliveryPrice: 350,
        discountPercent: 10,
        selectedAssemblies: [{ type: 'catalog', productAssemblyId: optionalAssembly.id }],
      }),
    });

    const readBack = await getQuote({ db: context.db, id: quote.id });
    if (readBack.kind !== 'product') throw new Error('Expected Product Quote');

    // base 1000 + assembly 500 = 1500; 10% discount = 150; + delivery 350 = 1700 ex-VAT.
    expect(priceQuote(readBack)).toMatchObject({
      discountAmount: 150,
      selectedAssemblyTotal: 500,
      subtotal: 1700,
      total: 1955,
      vatAmount: 255,
    });
  });

  test('changes only the named field and leaves commercial fields untouched', async ({ context }) => {
    const quote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        depositPercent: 30,
        discountPercent: 10,
        documentNotes: 'Deposit on order',
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    const updated = await patchQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: { id: quote.id, status: 'sent' },
    });

    expect(updated.status).toBe('sent');
    expect(updated.discountPercent).toBe(10);
    expect(updated.depositPercent).toBe(30);
    expect(updated.documentNotes).toBe('Deposit on order');
    expect(updated.statusChangedAt).not.toBe(quote.statusChangedAt);
  });

  test('clears a nullable field on an explicit null and no-ops when nothing changes', async ({ context }) => {
    const quote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        documentNotes: 'Clear me',
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    const cleared = await patchQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: { id: quote.id, documentNotes: null },
    });
    expect(cleared.documentNotes).toBeNull();

    const unchanged = await patchQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: { id: quote.id },
    });
    expect(unchanged.documentNotes).toBeNull();
    expect(unchanged.status).toBe('draft');
  });

  test('enforces the Quote lock rules for the changed fields', async ({ context }) => {
    const acceptedCustom = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'custom', workTitle: 'Locked repair', basePrice: 2200, hourlyRate: 850 },
        salesPersonId: context.salesPerson.id,
        status: 'accepted',
      }),
    });

    // Notes stay editable after acceptance even though commercial fields are locked.
    const noted = await patchQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: { id: acceptedCustom.id, notes: 'Post-acceptance note' },
    });
    expect(noted.notes).toBe('Post-acceptance note');

    // Status is not a lock-editable field, so patching it on a locked Quote is rejected.
    await expect(
      patchQuote({
        actorUserId: context.salesPerson.id,
        db: context.db,
        input: { id: acceptedCustom.id, status: 'sent' },
      }),
    ).rejects.toThrow('Quote is locked because it has been accepted; status cannot be changed.');
  });
});

describe('cancelQuote', () => {
  test('cancels an accepted custom Quote without Job side effects and audits the status change', async ({
    context,
  }) => {
    const quote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'custom', workTitle: 'Workshop repair', basePrice: 2200, hourlyRate: 850 },
        salesPersonId: context.salesPerson.id,
        status: 'accepted',
      }),
    });

    await cancelQuote({ actorUserId: context.salesPerson.id, db: context.db, id: quote.id });

    await expect(getQuote({ db: context.db, id: quote.id })).resolves.toMatchObject({
      job: null,
      status: 'cancelled',
    });
    expect(await context.db.select().from(jobs)).toEqual([]);
    await expect(
      context.db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.entityType, 'quote'), eq(auditEvents.entityId, quote.id)))
        .orderBy(asc(auditEvents.occurredAt)),
    ).resolves.toEqual([
      expect.objectContaining({ action: 'created', actorUserId: context.salesPerson.id }),
      expect.objectContaining({
        action: 'updated',
        actorUserId: context.salesPerson.id,
        changes: expect.objectContaining({ status: { from: 'accepted', to: 'cancelled' } }),
      }),
    ]);
  });

  test('preserves done and active work, removes scheduled work, and reflows every Bay', async ({ context }) => {
    const today = getPlantDateNow();
    const quote = await createQuote(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      status: 'accepted',
    });
    const downstreamQuote = await createQuote(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      status: 'accepted',
    });
    const [job, downstreamJob] = await context.db
      .insert(jobs)
      .values([
        {
          description: 'Target build',
          invoiceNumber: 'INV-912',
          productId: context.product.id,
          productSerialNumber: 'QUOTE-SUMMARY-001-26-912',
          productSerialPrefix: 'QUOTE-SUMMARY-001',
          productSerialSequence: 912,
          productSerialYear: 26,
          quoteId: quote.id,
          vinNumber: 'VIN-912',
        },
        {
          productId: context.product.id,
          productSerialNumber: 'QUOTE-SUMMARY-001-26-913',
          productSerialPrefix: 'QUOTE-SUMMARY-001',
          productSerialSequence: 913,
          productSerialYear: 26,
          quoteId: downstreamQuote.id,
        },
      ])
      .returning();

    if (!job || !downstreamJob) {
      throw new Error('Job insert did not return required rows');
    }

    const firstBay = await createBay(context.db, {
      id: '00000000-0000-4000-8000-000000000701',
      name: 'Cancellation Bay A',
      scheduleOrigin: addDateOnlyDays(today, -3),
    });
    const secondBay = await createBay(context.db, {
      id: '00000000-0000-4000-8000-000000000702',
      name: 'Cancellation Bay B',
      scheduleOrigin: today,
    });
    const slotIds = {
      active: '00000000-0000-4000-8000-000000000712',
      done: '00000000-0000-4000-8000-000000000711',
      scheduled: '00000000-0000-4000-8000-000000000713',
      zeroConsumedActive: '00000000-0000-4000-8000-000000000721',
      secondScheduled: '00000000-0000-4000-8000-000000000723',
    } as const;
    await context.db.insert(jobSlots).values([
      { id: slotIds.done, bayId: firstBay.id, durationDays: 2, jobId: job.id, kind: 'work', sequence: 1 },
      { id: slotIds.active, bayId: firstBay.id, durationDays: 3, jobId: job.id, kind: 'work', sequence: 2 },
      { id: slotIds.scheduled, bayId: firstBay.id, durationDays: 2, jobId: job.id, kind: 'work', sequence: 3 },
      { bayId: firstBay.id, durationDays: 4, jobId: downstreamJob.id, kind: 'work', sequence: 4 },
      {
        id: slotIds.zeroConsumedActive,
        bayId: secondBay.id,
        durationDays: 2,
        jobId: job.id,
        kind: 'work',
        sequence: 1,
      },
      { bayId: secondBay.id, durationDays: 3, jobId: downstreamJob.id, kind: 'work', sequence: 2 },
      {
        id: slotIds.secondScheduled,
        bayId: secondBay.id,
        durationDays: 1,
        jobId: job.id,
        kind: 'work',
        sequence: 3,
      },
    ]);

    await cancelQuote({ actorUserId: context.salesPerson.id, db: context.db, id: quote.id });

    const [cancelledJob] = await context.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(cancelledJob?.cancelledAt).toBeInstanceOf(Date);
    const remainingSlots = await context.db
      .select()
      .from(jobSlots)
      .orderBy(asc(jobSlots.bayId), asc(jobSlots.sequence));
    expect(remainingSlots).toEqual([
      expect.objectContaining({ id: slotIds.done, bayId: firstBay.id, durationDays: 2, sequence: 1 }),
      expect.objectContaining({ id: slotIds.active, bayId: firstBay.id, durationDays: 3, sequence: 2 }),
      expect.objectContaining({ bayId: firstBay.id, jobId: downstreamJob.id, sequence: 3 }),
      expect.objectContaining({ id: slotIds.zeroConsumedActive, bayId: secondBay.id, durationDays: 2, sequence: 1 }),
      expect.objectContaining({ bayId: secondBay.id, jobId: downstreamJob.id, sequence: 2 }),
    ]);
    expect(remainingSlots.map((slot) => slot.id)).not.toEqual(
      expect.arrayContaining([slotIds.scheduled, slotIds.secondScheduled]),
    );

    const events = await context.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, job.id), eq(auditEvents.entityType, 'job')));
    expect(events).toEqual([expect.objectContaining({ action: 'deleted', actorUserId: context.salesPerson.id })]);

    // getJob still resolves the cancelled Job (read-only sheet), and its schedule describes only the
    // retained done/active Slots — never the removed future Slots — so it offers no cancelled capacity.
    const detail = await getJob({ db: context.db, id: job.id });
    const scheduledSlotIds = detail.schedule.flatMap((department) =>
      department.bays.flatMap((bay) => bay.slots.map((slot) => slot.id)),
    );
    expect(scheduledSlotIds).toEqual(
      expect.arrayContaining([slotIds.done, slotIds.active, slotIds.zeroConsumedActive]),
    );
    expect(scheduledSlotIds).not.toContain(slotIds.scheduled);
    expect(scheduledSlotIds).not.toContain(slotIds.secondScheduled);
  });

  test('rejects cancelling an already-cancelled Quote with a stable code', async ({ context }) => {
    const quote = await createQuote(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      status: 'cancelled',
    });

    await expect(
      cancelQuote({ actorUserId: context.salesPerson.id, db: context.db, id: quote.id }),
    ).rejects.toMatchObject({ code: 'quote.already_cancelled' });
  });
});

describe('listPriorityQuotes', () => {
  test('derives the priority window from the injected plant date', async ({ context }) => {
    const marchEndQuote = await createQuote(context.db, {
      customerId: context.customer.id,
      plannedDeliveryDate: '2026-03-31',
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      status: 'accepted',
    });
    const aprilStartQuote = await createQuote(context.db, {
      customerId: context.customer.id,
      plannedDeliveryDate: '2026-04-01',
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      status: 'accepted',
    });

    await expect(
      listPriorityQuotes({
        clock: () => new Date('2026-01-31T21:59:59.000Z'),
        db: context.db,
      }),
    ).resolves.toMatchObject([{ id: marchEndQuote.id }]);
    await expect(
      listPriorityQuotes({
        clock: () => new Date('2026-01-31T22:00:00.000Z'),
        db: context.db,
      }),
    ).resolves.toMatchObject([{ id: marchEndQuote.id }, { id: aprilStartQuote.id }]);
  });
});

describe('getQuoteProductBayAvailability', () => {
  test('returns build time when a Product has no enabled Bays', async ({ context }) => {
    const quote = await createQuote(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
    });

    await expect(
      getQuoteProductBayAvailability({
        db: context.db,
        input: { quoteId: quote.id },
      }),
    ).resolves.toMatchObject({
      bays: [],
      buildTimeDays: 14,
      defaultLeadTimeWorkingDays: 14,
      maxBayWaitWorkingDays: 0,
    });
  });

  test('uses the max enabled Product Bay wait and ignores disabled Bays', async ({ context }) => {
    const today = getPlantDateNow();
    const quickBay = await createBay(context.db, {
      id: '00000000-0000-4000-8000-000000000601',
      name: 'Quick Bay',
      scheduleOrigin: today,
    });
    const slowerBay = await createBay(context.db, {
      id: '00000000-0000-4000-8000-000000000602',
      name: 'Slower Bay',
      scheduleOrigin: today,
    });
    const disabledBay = await createBay(context.db, {
      disabledAt: new Date('2026-06-01T00:00:00.000Z'),
      id: '00000000-0000-4000-8000-000000000603',
      name: 'Disabled Bay',
      scheduleOrigin: today,
    });
    await context.db.insert(productBays).values([
      { bayId: quickBay.id, defaultWorkingDays: 2, productId: context.product.id },
      { bayId: slowerBay.id, defaultWorkingDays: 3, productId: context.product.id },
      { bayId: disabledBay.id, defaultWorkingDays: 9, productId: context.product.id },
    ]);
    await context.db.insert(jobSlots).values([
      { bayId: quickBay.id, durationDays: 1, kind: 'idle', label: null, sequence: 1 },
      { bayId: slowerBay.id, durationDays: 4, kind: 'idle', label: null, sequence: 1 },
      { bayId: disabledBay.id, durationDays: 8, kind: 'idle', label: null, sequence: 1 },
    ]);
    const quote = await createQuote(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
    });

    await expect(
      getQuoteProductBayAvailability({
        db: context.db,
        input: { quoteId: quote.id },
      }),
    ).resolves.toMatchObject({
      bays: [
        expect.objectContaining({ bayId: quickBay.id, name: 'Quick Bay', waitWorkingDays: 1 }),
        expect.objectContaining({ bayId: slowerBay.id, name: 'Slower Bay', waitWorkingDays: 4 }),
      ],
      buildTimeDays: 14,
      defaultLeadTimeWorkingDays: 18,
      maxBayWaitWorkingDays: 4,
    });
  });

  test('uses org Off-Days and Bay Calendar Exceptions when deriving the next available date', async ({ context }) => {
    const today = getPlantDateNow();
    const offDay = addDateOnlyDays(today, 1);
    const closedBayNextAvailableDate = addJobSlotDuration(today, 2, { orgOffDays: new Set([offDay]) });
    const overtimeBayNextAvailableDate = addJobSlotDuration(today, 2, {
      bayExceptions: new Map([[offDay, 'work']]),
      orgOffDays: new Set([offDay]),
    });
    const closedBay = await createBay(context.db, {
      id: '00000000-0000-4000-8000-000000000604',
      name: 'Closed Bay',
      scheduleOrigin: today,
    });
    const overtimeBay = await createBay(context.db, {
      id: '00000000-0000-4000-8000-000000000605',
      name: 'Overtime Bay',
      scheduleOrigin: today,
    });
    await context.db.insert(productBays).values([
      { bayId: closedBay.id, defaultWorkingDays: 2, productId: context.product.id },
      { bayId: overtimeBay.id, defaultWorkingDays: 2, productId: context.product.id },
    ]);
    await context.db.insert(workingCalendarOffDays).values({ date: offDay, label: 'Shutdown' });
    await context.db.insert(jobBayCalendarExceptions).values({
      bayId: overtimeBay.id,
      date: offDay,
      direction: 'work',
      label: 'Overtime',
    });
    await context.db.insert(jobSlots).values([
      { bayId: closedBay.id, durationDays: 2, kind: 'idle', label: null, sequence: 1 },
      { bayId: overtimeBay.id, durationDays: 2, kind: 'idle', label: null, sequence: 1 },
    ]);
    const quote = await createQuote(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
    });

    await expect(
      getQuoteProductBayAvailability({
        db: context.db,
        input: { quoteId: quote.id },
      }),
    ).resolves.toMatchObject({
      bays: [
        expect.objectContaining({
          bayId: closedBay.id,
          nextAvailableDate: closedBayNextAvailableDate,
          waitWorkingDays: 2,
        }),
        expect.objectContaining({
          bayId: overtimeBay.id,
          nextAvailableDate: overtimeBayNextAvailableDate,
          waitWorkingDays: 2,
        }),
      ],
      defaultLeadTimeWorkingDays: 16,
    });
  });

  test('rejects unknown Quotes instead of accepting arbitrary Product ids', async ({ context }) => {
    await expect(
      getQuoteProductBayAvailability({
        db: context.db,
        input: { quoteId: '00000000-0000-4000-8000-000000000999' },
      }),
    ).rejects.toThrow('Quote not found: 00000000-0000-4000-8000-000000000999');
  });
});

async function createQuote(
  db: Db,
  {
    customerId,
    productId,
    salesPersonId,
    plannedDeliveryDate,
    preferredDeliveryDate,
    status = 'draft',
  }: {
    customerId: string;
    plannedDeliveryDate?: string;
    preferredDeliveryDate?: string;
    productId: string;
    salesPersonId: string;
    status?: QuoteStatus;
  },
) {
  const [quote] = await db
    .insert(quotes)
    .values({
      customerId,
      plannedDeliveryDate,
      preferredDeliveryDate,
      productId,
      quotedBasePrice: 1000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId,
      status,
    })
    .returning();

  if (!quote) {
    throw new Error('Quote insert did not return a row');
  }

  return quote;
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

function buildQuoteUpdateInput(quote: QuoteDetail, overrides: Partial<QuoteUpdateInput> = {}): QuoteUpdateInput {
  return QuoteUpdateInput.parse({
    deliveryIncluded: quote.deliveryIncluded,
    deliveryPrice: quote.deliveryPrice,
    depositPercent: quote.depositPercent,
    discountPercent: quote.discountPercent,
    documentNotes: quote.documentNotes,
    id: quote.id,
    offering:
      quote.kind === 'custom'
        ? {
            kind: 'custom',
            basePrice: quote.quotedBasePrice,
            hourlyRate: quote.hourlyRate,
            workTitle: quote.workTitle,
            workItems: quote.workItems.map(({ hours, name, parts }) => ({
              hours,
              name,
              parts: parts.map(({ name, quantity, unitPrice }) => ({ name, quantity, unitPrice })),
            })),
          }
        : { kind: 'product' },
    notes: quote.notes,
    plannedDeliveryDate: quote.plannedDeliveryDate,
    preferredDeliveryDate: quote.preferredDeliveryDate,
    salesPersonId: quote.salesPersonId,
    selectedAssemblies: quote.selectedAssemblies.map((item) => ({ type: 'existing' as const, id: item.id })),
    status: quote.status,
    validUntil: quote.validUntil,
    ...overrides,
  });
}

describe('listQuoteSalespeople', () => {
  test('includes super-admin, admin, and sales users and excludes other roles', async ({ context }) => {
    const now = new Date();
    await context.db.insert(user).values([
      {
        createdAt: now,
        email: 'super-admin@example.com',
        emailVerified: true,
        id: 'super-admin-user-id',
        name: 'Super Admin User',
        role: 'super-admin',
        updatedAt: now,
      },
      {
        createdAt: now,
        email: 'admin@example.com',
        emailVerified: true,
        id: 'admin-user-id',
        name: 'Admin User',
        role: 'admin',
        updatedAt: now,
      },
      {
        createdAt: now,
        email: 'bay-operator@example.com',
        emailVerified: true,
        id: 'bay-operator-user-id',
        name: 'Bay Operator User',
        role: 'bay-operator',
        updatedAt: now,
      },
    ]);

    const result = await listQuoteSalespeople({ db: context.db });
    const rolesById = new Map(result.users.map((person) => [person.id, person.role]));

    expect(rolesById.get('super-admin-user-id')).toBe('super-admin');
    expect(rolesById.get('admin-user-id')).toBe('admin');
    expect(rolesById.get(context.salesPerson.id)).toBe('sales');
    expect(rolesById.has('bay-operator-user-id')).toBe(false);
  });
});
