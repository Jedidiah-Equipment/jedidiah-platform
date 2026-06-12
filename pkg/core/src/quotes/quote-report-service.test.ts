import { customers, type Db, products, quotes, user } from '@pkg/db';
import type { QuoteStatus } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import {
  listStaleSentQuotes,
  summarizeQuotePipeline,
  summarizeQuotesByStatus,
  summarizeQuoteWeeklyFlow,
} from './quote-report-service.js';

const test = createTester(async ({ db }) => {
  const now = new Date();
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
      modelCode: 'QUOTE-REPORT-001',
      name: 'Quote Report Product',
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

describe('summarizeQuotesByStatus', () => {
  test('returns every quote status with zero-filled missing statuses', async ({ context }) => {
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['draft', 'draft', 'accepted', 'cancelled'],
    });

    await expect(summarizeQuotesByStatus({ db: context.db })).resolves.toEqual({
      items: [
        { count: 2, status: 'draft' },
        { count: 0, status: 'sent' },
        { count: 1, status: 'accepted' },
        { count: 0, status: 'rejected' },
        { count: 1, status: 'cancelled' },
      ],
    });
  });

  test('returns all statuses as zero when there are no quotes', async ({ context }) => {
    await expect(summarizeQuotesByStatus({ db: context.db })).resolves.toEqual({
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

describe('summarizeQuotePipeline', () => {
  const fixedClock = () => new Date('2026-06-04T10:00:00.000Z');

  test('sums sent quote totals and splits out the newly-sent 30-day window on plant day boundaries', async ({
    context,
  }) => {
    // 30-day window covering plant today starts at 2026-05-06; sent on the boundary day is included.
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      deliveryIncluded: true,
      deliveryPrice: 100,
      discountPercent: 10,
      productId: context.product.id,
      quotedBasePrice: 2000,
      salesPersonId: context.salesPerson.id,
      statuses: ['sent'],
      statusChangedAt: zonedInstant('2026-05-06T00:00:00'),
    });
    // Sent just before the window start stays in the open pipeline but not in the newly-sent value.
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      quotedBasePrice: 500,
      salesPersonId: context.salesPerson.id,
      statuses: ['sent'],
      statusChangedAt: zonedInstant('2026-05-05T23:59:59'),
    });
    // Non-sent statuses never contribute to pipeline value.
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      quotedBasePrice: 9000,
      salesPersonId: context.salesPerson.id,
      statuses: ['draft', 'accepted', 'cancelled'],
      statusChangedAt: zonedInstant('2026-06-01T08:00:00'),
    });

    const summary = await summarizeQuotePipeline({ clock: fixedClock, db: context.db });

    // 2000 + 100 delivery - 10% discount on base = 1900, plus the 500 quote outside the 30d window.
    expect(summary).toMatchObject({
      newlySent30dValue: 1900,
      openSentCount: 2,
      openSentValue: 2400,
    });
  });

  test('counts accepted and rejected decisions inside the 90-day window and excludes cancelled', async ({
    context,
  }) => {
    // 90-day window covering plant today starts at 2026-03-07.
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['accepted', 'accepted', 'rejected', 'cancelled'],
      statusChangedAt: zonedInstant('2026-03-07T00:00:00'),
    });
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['accepted', 'rejected'],
      statusChangedAt: zonedInstant('2026-03-06T23:59:59'),
    });

    await expect(summarizeQuotePipeline({ clock: fixedClock, db: context.db })).resolves.toEqual({
      accepted90dCount: 2,
      newlySent30dValue: 0,
      openSentCount: 0,
      openSentValue: 0,
      rejected90dCount: 1,
    });
  });
});

describe('listStaleSentQuotes', () => {
  const fixedClock = () => new Date('2026-06-04T10:00:00.000Z');

  test('lists sent quotes oldest-first with plant-day staleness and quote totals', async ({ context }) => {
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      quotedBasePrice: 1500,
      salesPersonId: context.salesPerson.id,
      statuses: ['sent'],
      statusChangedAt: zonedInstant('2026-06-01T09:00:00'),
    });
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      deliveryIncluded: true,
      deliveryPrice: 50,
      productId: context.product.id,
      quotedBasePrice: 3000,
      salesPersonId: context.salesPerson.id,
      statuses: ['sent'],
      statusChangedAt: zonedInstant('2026-05-20T09:00:00'),
    });
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['draft', 'accepted'],
      statusChangedAt: zonedInstant('2026-05-01T09:00:00'),
    });

    const result = await listStaleSentQuotes({ clock: fixedClock, db: context.db });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      customerCompanyName: 'Acme Mining',
      sentDaysAgo: 15,
      totalValue: 3050,
    });
    expect(result.items[1]).toMatchObject({
      sentDaysAgo: 3,
      totalValue: 1500,
    });
  });

  test('caps the list at the stale-sent limit', async ({ context }) => {
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: Array.from({ length: 10 }, () => 'sent' as const),
      statusChangedAt: zonedInstant('2026-05-20T09:00:00'),
    });

    const result = await listStaleSentQuotes({ clock: fixedClock, db: context.db });

    expect(result.items).toHaveLength(8);
  });
});

// Johannesburg wall-clock instants keep window boundary tests aligned with plant business dates.
function zonedInstant(johannesburgLocalTime: string): Date {
  return new Date(`${johannesburgLocalTime}+02:00`);
}

async function createQuoteRows(
  db: Db,
  {
    createdAt,
    customerId,
    deliveryIncluded = false,
    deliveryPrice = 0,
    discountPercent = 0,
    productId,
    quotedBasePrice = 1000,
    salesPersonId,
    statuses,
    statusChangedAt,
  }: {
    createdAt?: Date;
    customerId: string;
    deliveryIncluded?: boolean;
    deliveryPrice?: number;
    discountPercent?: number;
    productId: string;
    quotedBasePrice?: number;
    salesPersonId: string;
    statuses: QuoteStatus[];
    statusChangedAt?: Date;
  },
) {
  await db.insert(quotes).values(
    statuses.map((status) => ({
      customerId,
      ...(createdAt ? { createdAt, updatedAt: createdAt } : {}),
      ...(statusChangedAt ? { statusChangedAt } : {}),
      deliveryIncluded,
      deliveryPrice,
      discountPercent,
      productId,
      quotedBasePrice,
      quotedCurrencyCode: 'ZAR',
      salesPersonId,
      status,
    })),
  );
}
