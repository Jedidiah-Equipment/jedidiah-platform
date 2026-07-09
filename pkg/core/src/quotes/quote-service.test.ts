import {
  auditEvents,
  customers,
  type Db,
  jobBayCalendarExceptions,
  jobBays,
  jobSlots,
  jobs,
  productBays,
  products,
  quoteLineItems,
  quotes,
  user,
  workingCalendarOffDays,
} from '@pkg/db';
import { addDateOnlyDays, addJobSlotDuration, getPlantDateNow } from '@pkg/domain';
import { formatJobCode, QuoteCreateInput, type QuoteDetail, type QuoteStatus, QuoteUpdateInput } from '@pkg/schema';
import { and, asc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import {
  getQuote,
  getQuoteProductBayAvailability,
  listPriorityQuotes,
  listQuoteSalespeople,
  listQuotes,
} from './quote-read-service.js';
import { createQuote as createQuoteService, updateQuote, updateQuoteFields } from './quote-service.js';

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

describe('quote line items', () => {
  test('creates line items and full-replaces them on update', async ({ context }) => {
    const created = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        lineItems: [
          { name: 'Hydraulic hose', quantity: 2, unitPrice: 125 },
          { name: 'Transport crate', quantity: 1, unitPrice: 300 },
        ],
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    expect(created.lineItems).toMatchObject([
      { name: 'Hydraulic hose', quantity: 2, unitPrice: 125 },
      { name: 'Transport crate', quantity: 1, unitPrice: 300 },
    ]);

    const updated = await updateQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: buildQuoteUpdateInput(created, {
        lineItems: [{ name: 'Calibration', quantity: 3, unitPrice: 75 }],
        status: 'sent',
      }),
    });
    const rows = await context.db
      .select()
      .from(quoteLineItems)
      .where(eq(quoteLineItems.quoteId, created.id))
      .orderBy(asc(quoteLineItems.position));

    expect(updated.lineItems).toMatchObject([{ name: 'Calibration', quantity: 3, unitPrice: 75 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Calibration', position: 0, quantity: 3, unitPrice: 75 });
    expect(rows[0]?.id).not.toBe(created.lineItems[0]?.id);
  });

  test('persists reorder-only line item updates even when the audit projection is unchanged', async ({ context }) => {
    const created = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        lineItems: [
          { name: 'Hydraulic hose', quantity: 2, unitPrice: 125 },
          { name: 'Transport crate', quantity: 1, unitPrice: 300 },
        ],
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    const updated = await updateQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: buildQuoteUpdateInput(created, {
        lineItems: [
          { name: 'Transport crate', quantity: 1, unitPrice: 300 },
          { name: 'Hydraulic hose', quantity: 2, unitPrice: 125 },
        ],
      }),
    });
    const rows = await context.db
      .select()
      .from(quoteLineItems)
      .where(eq(quoteLineItems.quoteId, created.id))
      .orderBy(asc(quoteLineItems.position));

    expect(updated.lineItems).toMatchObject([
      { name: 'Transport crate', quantity: 1, unitPrice: 300 },
      { name: 'Hydraulic hose', quantity: 2, unitPrice: 125 },
    ]);
    expect(rows).toMatchObject([
      { name: 'Transport crate', position: 0 },
      { name: 'Hydraulic hose', position: 1 },
    ]);
  });

  test('preserves existing line items when update input omits the field', async ({ context }) => {
    const quote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        lineItems: [
          { name: 'Hydraulic hose', quantity: 2, unitPrice: 125 },
          { name: 'Transport crate', quantity: 1, unitPrice: 300 },
        ],
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'accepted',
      }),
    });
    await context.db.insert(jobs).values({
      productId: quote.productId ?? context.product.id,
      productSerialNumber: `${context.product.modelCode}-26-100`,
      productSerialPrefix: context.product.modelCode,
      productSerialSequence: 100,
      productSerialYear: 26,
      quoteId: quote.id,
    });
    const input = buildQuoteUpdateInput(quote, { notes: 'Locked quote follow-up note' });
    delete input.lineItems;

    const updated = await updateQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input,
    });

    expect(updated.notes).toBe('Locked quote follow-up note');
    expect(updated.lineItems).toMatchObject([
      { name: 'Hydraulic hose', quantity: 2, unitPrice: 125 },
      { name: 'Transport crate', quantity: 1, unitPrice: 300 },
    ]);
  });

  test('rejects line item changes on a locked quote', async ({ context }) => {
    const quote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        lineItems: [{ name: 'Hydraulic hose', quantity: 2, unitPrice: 125 }],
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'accepted',
      }),
    });
    await context.db.insert(jobs).values({
      productId: quote.productId ?? context.product.id,
      productSerialNumber: `${context.product.modelCode}-26-099`,
      productSerialPrefix: context.product.modelCode,
      productSerialSequence: 99,
      productSerialYear: 26,
      quoteId: quote.id,
    });

    await expect(
      updateQuote({
        actorUserId: context.salesPerson.id,
        db: context.db,
        input: buildQuoteUpdateInput(quote, {
          lineItems: [{ name: 'Changed hose', quantity: 2, unitPrice: 125 }],
        }),
      }),
    ).rejects.toThrow('Quote is locked because it already has a Job; lineItems cannot be changed.');
  });

  test('records line item changes in quote audit events', async ({ context }) => {
    const quote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        lineItems: [{ name: 'Hydraulic hose', quantity: 2, unitPrice: 125 }],
        offering: { kind: 'product', productId: context.product.id },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    await updateQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: buildQuoteUpdateInput(quote, {
        lineItems: [{ name: 'Hydraulic hose', quantity: 3, unitPrice: 125 }],
      }),
    });

    const events = await context.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityType, 'quote'), eq(auditEvents.entityId, quote.id)));
    const updateEvent = events.find((event) => event.action === 'updated');

    expect(updateEvent?.changes).toMatchObject({
      lineItems: {
        from: JSON.stringify([{ name: 'Hydraulic hose', quantity: 2, unitPrice: 125 }]),
        to: JSON.stringify([{ name: 'Hydraulic hose', quantity: 3, unitPrice: 125 }]),
      },
    });
  });
});

describe('custom quotes', () => {
  test('creates a custom quote with entered base price, work title, line items, and no product facts', async ({
    context,
  }) => {
    const created = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'custom', workTitle: 'Hydraulic repair', basePrice: 2500 },
        lineItems: [{ name: 'Travel', quantity: 2, unitPrice: 150 }],
        salesPersonId: context.salesPerson.id,
        status: 'sent',
      }),
    });

    expect(created).toMatchObject({
      kind: 'custom',
      productId: null,
      product: null,
      quotedBasePrice: 2500,
      quotedCurrencyCode: 'ZAR',
      selectedAssemblies: [],
      workTitle: 'Hydraulic repair',
    });
    expect(created.lineItems).toMatchObject([{ name: 'Travel', quantity: 2, unitPrice: 150 }]);
  });

  test('rejects selected assemblies on custom quote create and update', async ({ context }) => {
    await expect(
      createQuoteService({
        actorUserId: context.salesPerson.id,
        db: context.db,
        input: QuoteCreateInput.parse({
          customer: { type: 'existing', customerId: context.customer.id },
          offering: { kind: 'custom', workTitle: 'Pump rebuild', basePrice: 3000 },
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
        offering: { kind: 'custom', workTitle: 'Pump rebuild', basePrice: 3000 },
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
        offering: { kind: 'custom', workTitle: 'Draft repair', basePrice: 1500 },
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
        offering: { kind: 'custom', basePrice: 1750, workTitle: 'Draft repair revised' },
        lineItems: [{ name: 'Travel', quantity: 1, unitPrice: 200 }],
      }),
    });

    expect(updated).toMatchObject({
      discountPercent: 5,
      quotedBasePrice: 1750,
      workTitle: 'Draft repair revised',
    });
    expect(updated.lineItems).toMatchObject([{ name: 'Travel', quantity: 1, unitPrice: 200 }]);
  });

  test('rejects clearing a custom quote work title at the update input boundary', async ({ context }) => {
    const customQuote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'custom', workTitle: 'Repair work', basePrice: 1500 },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    expect(() =>
      buildQuoteUpdateInput(customQuote, {
        offering: { kind: 'custom', basePrice: 1500, workTitle: '' },
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
          offering: { kind: 'custom', basePrice: 1500, workTitle: 'Repair work' },
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
        offering: { kind: 'custom', workTitle: 'Accepted repair', basePrice: 2200 },
        salesPersonId: context.salesPerson.id,
        status: 'accepted',
      }),
    });

    await expect(
      updateQuote({
        actorUserId: context.salesPerson.id,
        db: context.db,
        input: buildQuoteUpdateInput(customQuote, {
          offering: { kind: 'custom', basePrice: 2300, workTitle: 'Accepted repair' },
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
        offering: { kind: 'custom', workTitle: 'Availability-free repair', basePrice: 1800 },
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
        offering: { kind: 'custom', workTitle: 'Priority repair', basePrice: 1800 },
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
        offering: { kind: 'custom', workTitle: 'Axle rebuild', basePrice: 1800 },
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

  test('records custom quote kind, work title, and base price edits in audit events', async ({ context }) => {
    const customQuote = await createQuoteService({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: QuoteCreateInput.parse({
        customer: { type: 'existing', customerId: context.customer.id },
        offering: { kind: 'custom', workTitle: 'Audit repair', basePrice: 2000 },
        salesPersonId: context.salesPerson.id,
        status: 'draft',
      }),
    });

    await updateQuote({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: buildQuoteUpdateInput(customQuote, {
        offering: { kind: 'custom', basePrice: 2100, workTitle: 'Audit repair revised' },
      }),
    });

    const events = await context.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityType, 'quote'), eq(auditEvents.entityId, customQuote.id)));
    const createEvent = events.find((event) => event.action === 'created');
    const updateEvent = events.find((event) => event.action === 'updated');

    expect(createEvent?.changes).toMatchObject({
      kind: { from: null, to: 'custom' },
      workTitle: { from: null, to: 'Audit repair' },
    });
    expect(updateEvent?.changes).toMatchObject({
      quotedBasePrice: { from: 2000, to: 2100 },
      workTitle: { from: 'Audit repair', to: 'Audit repair revised' },
    });
  });
});

describe('updateQuoteFields', () => {
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

    const updated = await updateQuoteFields({
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

    const cleared = await updateQuoteFields({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: { id: quote.id, documentNotes: null },
    });
    expect(cleared.documentNotes).toBeNull();

    const unchanged = await updateQuoteFields({
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
        offering: { kind: 'custom', workTitle: 'Locked repair', basePrice: 2200 },
        salesPersonId: context.salesPerson.id,
        status: 'accepted',
      }),
    });

    // Notes stay editable after acceptance even though commercial fields are locked.
    const noted = await updateQuoteFields({
      actorUserId: context.salesPerson.id,
      db: context.db,
      input: { id: acceptedCustom.id, notes: 'Post-acceptance note' },
    });
    expect(noted.notes).toBe('Post-acceptance note');
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
        ? { kind: 'custom', basePrice: quote.quotedBasePrice, workTitle: quote.workTitle }
        : { kind: 'product' },
    lineItems: quote.lineItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
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
