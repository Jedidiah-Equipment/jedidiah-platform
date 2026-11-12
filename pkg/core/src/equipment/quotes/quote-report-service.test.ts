import { type Db, user } from '@pkg/db';
import { customers, jobs, products, quotes, quoteWorkItemParts, quoteWorkItems } from '@pkg/db/equipment';
import { DateOnlyIso } from '@pkg/schema';
import { hasQuoteStatus, type QuoteDeliveryTerms, type QuoteStatus, soldQuoteStatuses } from '@pkg/schema/equipment';
import { describe, expect } from 'vitest';

import { createTester } from '../../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { testQuoteActor } from '../test/quote-actor.js';
import { listStaleSentQuotes, summarizeInvoicedByMonth, summarizeQuoteWeeklyFlow } from './quote-report-service.js';
import { removeQuoteInvoiceNumber } from './quote-stage-service.js';

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
      quoteSalesperson: true,
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
      modelCode: 'QUOTE-REPORT-001',
      name: 'Quote Report Product',
      rangeId,
      thumbnailDataUrl: 'data:image/webp;base64,cHJvZHVjdA==',
    })
    .returning();

  if (!salesPerson || !customer || !product) {
    throw new Error('Quote report test setup did not return required rows');
  }

  return {
    customer,
    product,
    salesPerson,
  };
});

describe('summarizeInvoicedByMonth', () => {
  test('buckets Invoiced Quotes by plant-time month at their ex-VAT totals after discount', async ({ context }) => {
    const quote = {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['invoiced'] as QuoteStatus[],
    };
    // 2000 base + 100 delivery - 10% discount on the base = 1900, on the last evening of October.
    await createQuoteRows(context.db, {
      ...quote,
      deliveryPrice: 100,
      deliveryTerms: 'additional_charge',
      discountPercent: 10,
      invoicedAt: zonedInstant('2026-10-31T23:30:00'),
      quotedBasePrice: 2000,
    });
    await createQuoteRows(context.db, { ...quote, invoicedAt: zonedInstant('2026-11-01T00:30:00') });
    await createQuoteRows(context.db, { ...quote, invoicedAt: zonedInstant('2026-08-01T00:30:00') });
    // The day before the window opens.
    await createQuoteRows(context.db, { ...quote, invoicedAt: zonedInstant('2026-07-31T23:30:00') });
    const [unstamped] = await createQuoteRows(context.db, {
      ...quote,
      invoicedAt: zonedInstant('2026-11-05T09:00:00'),
    });
    if (!unstamped) throw new Error('Expected an invoiced quote row');
    await removeQuoteInvoiceNumber({
      actor: testQuoteActor(context.salesPerson.id, 'super-admin'),
      db: context.db,
      input: { id: unstamped.id },
    });

    await expect(summarizeInvoicedByMonth({ db: context.db, today: DateOnlyIso.parse('2026-11-12') })).resolves.toEqual(
      {
        months: [
          { month: '2026-11-01', quotes: 1, total: 1000 },
          { month: '2026-10-01', quotes: 1, total: 1900 },
          { month: '2026-09-01', quotes: 0, total: 0 },
          { month: '2026-08-01', quotes: 1, total: 1000 },
        ],
      },
    );
  });
});

describe('summarizeQuoteWeeklyFlow', () => {
  const fixedClock = () => new Date('2026-06-04T10:00:00.000Z');

  test('returns a 12-week Johannesburg series bucketing created and accepted independently', async ({ context }) => {
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['draft'],
      createdAt: new Date('2026-05-18T08:00:00.000Z'),
    });
    // Created in the week of May 25, accepted in the week of June 1.
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['sent', 'accepted'],
      createdAt: new Date('2026-05-26T08:00:00.000Z'),
      statusChangedAt: new Date('2026-06-02T08:00:00.000Z'),
    });
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['draft'],
      createdAt: new Date('2026-05-31T22:30:00.000Z'),
    });
    // Rejected and cancelled transitions never count as accepted flow.
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['cancelled', 'rejected'],
      createdAt: new Date('2026-05-26T09:00:00.000Z'),
      statusChangedAt: new Date('2026-06-02T09:00:00.000Z'),
    });
    // Outside the 12-week window in both axes.
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['accepted'],
      createdAt: new Date('2026-03-15T21:59:59.000Z'),
      statusChangedAt: new Date('2026-03-15T21:59:59.000Z'),
    });

    const summary = await summarizeQuoteWeeklyFlow({ clock: fixedClock, db: context.db });

    expect(summary.items).toHaveLength(12);
    expect(summary.items[0]).toEqual({ acceptedCount: 0, createdCount: 0, weekStartDate: '2026-03-16' });
    expect(summary.items[9]).toEqual({ acceptedCount: 0, createdCount: 1, weekStartDate: '2026-05-18' });
    expect(summary.items[10]).toEqual({ acceptedCount: 0, createdCount: 4, weekStartDate: '2026-05-25' });
    expect(summary.items[11]).toEqual({ acceptedCount: 1, createdCount: 1, weekStartDate: '2026-06-01' });
  });

  test('counts a sale in the week it was accepted after its status has moved on', async ({ context }) => {
    await createQuoteRows(context.db, {
      acceptedAt: new Date('2026-05-26T08:00:00.000Z'),
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['awaiting-invoice'],
      createdAt: new Date('2026-05-18T08:00:00.000Z'),
      statusChangedAt: new Date('2026-06-02T08:00:00.000Z'),
    });

    const summary = await summarizeQuoteWeeklyFlow({ clock: fixedClock, db: context.db });

    expect(summary.items[10]).toMatchObject({ acceptedCount: 1, weekStartDate: '2026-05-25' });
    expect(summary.items[11]).toMatchObject({ acceptedCount: 0, weekStartDate: '2026-06-01' });
  });

  test('returns a flat zero series when the whole window is empty', async ({ context }) => {
    const summary = await summarizeQuoteWeeklyFlow({ clock: fixedClock, db: context.db });

    expect(summary.items).toHaveLength(12);
    expect(summary.items.every((item) => item.acceptedCount === 0 && item.createdCount === 0)).toBe(true);
    expect(summary.items[0]?.weekStartDate).toBe('2026-03-16');
    expect(summary.items[11]?.weekStartDate).toBe('2026-06-01');
  });

  test('uses the injected plant date when the UTC day rolls into a Johannesburg Monday', async ({ context }) => {
    const rolloverClock = () => new Date('2026-01-04T22:00:00.000Z');

    await expect(summarizeQuoteWeeklyFlow({ clock: rolloverClock, db: context.db, weekCount: 1 })).resolves.toEqual({
      items: [{ acceptedCount: 0, createdCount: 0, weekStartDate: '2026-01-05' }],
    });
  });
});

describe('listStaleSentQuotes', () => {
  test('lists sent quotes oldest-first with quote totals', async ({ context }) => {
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      quotedBasePrice: 1500,
      salesPersonId: context.salesPerson.id,
      statuses: ['sent'],
      statusChangedAt: zonedInstant('2026-06-01T09:00:00'),
    });
    const [oldestQuote] = await createQuoteRows(context.db, {
      customerId: context.customer.id,
      deliveryTerms: 'additional_charge',
      deliveryPrice: 50,
      productId: context.product.id,
      quotedBasePrice: 3000,
      salesPersonId: context.salesPerson.id,
      statuses: ['sent'],
      statusChangedAt: zonedInstant('2026-05-20T09:00:00'),
    });
    if (!oldestQuote) throw new Error('Expected oldest sent quote row');
    const linkedJob = await createJobRow(context.db, { quoteId: oldestQuote.id });
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['draft', 'accepted'],
      statusChangedAt: zonedInstant('2026-05-01T09:00:00'),
    });

    const result = await listStaleSentQuotes({ db: context.db });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      customerCompanyName: 'Acme Mining',
      job: { jobId: linkedJob.id },
      kind: 'product',
      product: {
        name: 'Quote Report Product',
        thumbnailDataUrl: 'data:image/webp;base64,cHJvZHVjdA==',
      },
      totalValue: 3507.5,
    });
    expect(result.items[1]).toMatchObject({
      totalValue: 1725,
    });
  });

  test('includes custom sent quotes in stale-sent totals', async ({ context }) => {
    const [customQuote] = await createQuoteRows(context.db, {
      customerId: context.customer.id,
      kind: 'custom',
      productId: null,
      quotedBasePrice: 0,
      salesPersonId: context.salesPerson.id,
      statuses: ['sent'],
      statusChangedAt: zonedInstant('2026-05-20T09:00:00'),
      workTitle: 'Stale repair',
    });
    if (!customQuote) throw new Error('Expected custom sent quote row');
    const [workItem] = await context.db
      .insert(quoteWorkItems)
      .values({ department: 'assembly', hourlyRate: 320, hours: 3, quoteId: customQuote.id })
      .returning();
    if (!workItem) throw new Error('Expected custom work item row');
    await context.db
      .insert(quoteWorkItemParts)
      .values({ name: 'Fuel', quantity: 2, unitPrice: 50, workItemId: workItem.id });

    const result = await listStaleSentQuotes({ db: context.db });

    // 3 x R320 labour + R100 parts, plus VAT.
    expect(result.items).toEqual([
      expect.objectContaining({
        id: customQuote.id,
        kind: 'custom',
        product: null,
        totalValue: 1219,
        workTitle: 'Stale repair',
      }),
    ]);
  });

  test('caps the list at the stale-sent limit', async ({ context }) => {
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: Array.from({ length: 10 }, () => 'sent' as const),
      statusChangedAt: zonedInstant('2026-05-20T09:00:00'),
    });

    const result = await listStaleSentQuotes({ db: context.db });

    expect(result.items).toHaveLength(8);
  });
});

// Johannesburg wall-clock instants keep window boundary tests aligned with plant business dates.
function zonedInstant(johannesburgLocalTime: string): Date {
  return new Date(`${johannesburgLocalTime}+02:00`);
}

async function createJobRow(db: Db, { quoteId }: { quoteId: string }) {
  const [job] = await db.insert(jobs).values({ quoteId }).returning();

  if (!job) throw new Error('Expected job row');

  return job;
}

async function createQuoteRows(
  db: Db,
  {
    acceptedAt,
    createdAt,
    customerId,
    deliveryTerms = 'included' as QuoteDeliveryTerms,
    deliveryPrice = 0,
    discountPercent = 0,
    invoicedAt,
    kind = 'product',
    productId,
    quotedBasePrice = 1000,
    salesPersonId,
    statuses,
    statusChangedAt,
    workTitle = null,
  }: {
    acceptedAt?: Date;
    createdAt?: Date;
    customerId: string;
    deliveryTerms?: QuoteDeliveryTerms;
    deliveryPrice?: number;
    discountPercent?: number;
    invoicedAt?: Date;
    kind?: 'product' | 'custom';
    productId: string | null;
    quotedBasePrice?: number;
    salesPersonId: string;
    statuses: QuoteStatus[];
    statusChangedAt?: Date;
    workTitle?: string | null;
  },
) {
  return db
    .insert(quotes)
    .values(
      statuses.map((status) => ({
        cancellationReason: status === 'cancelled' ? 'Test cancellation reason' : null,
        customerId,
        ...(createdAt ? { createdAt, updatedAt: createdAt } : {}),
        ...(statusChangedAt ? { statusChangedAt } : {}),
        deliveryTerms,
        deliveryPrice,
        discountPercent,
        kind,
        productId,
        quotedBasePrice,
        quotedCurrencyCode: 'ZAR',
        salesPersonId,
        acceptedAt: hasQuoteStatus(soldQuoteStatuses, status) ? (acceptedAt ?? statusChangedAt ?? new Date()) : null,
        status,
        ...(status === 'invoiced' ? { invoiceNumber: 'INV-TEST', invoicedAt: invoicedAt ?? new Date() } : {}),
        workTitle,
      })),
    )
    .returning();
}
