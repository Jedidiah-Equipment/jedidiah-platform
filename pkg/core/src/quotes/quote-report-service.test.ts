import {
  customers,
  type Db,
  jobBays,
  jobSlots,
  jobs,
  products,
  quotes,
  quoteWorkItemParts,
  quoteWorkItems,
  user,
} from '@pkg/db';
import type { QuoteStatus } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import {
  listStaleSentQuotes,
  summarizeQuotePipeline,
  summarizeQuotesByStatus,
  summarizeQuoteWeeklyFlow,
} from './quote-report-service.js';

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
      modelCode: 'QUOTE-REPORT-001',
      name: 'Quote Report Product',
      rangeId,
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
    const [boundaryQuote] = await createQuoteRows(context.db, {
      customerId: context.customer.id,
      deliveryIncluded: false,
      deliveryPrice: 100,
      discountPercent: 10,
      productId: context.product.id,
      quotedBasePrice: 2000,
      salesPersonId: context.salesPerson.id,
      statuses: ['sent'],
      statusChangedAt: zonedInstant('2026-05-06T00:00:00'),
    });
    if (!boundaryQuote) throw new Error('Expected sent quote row');
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

    // 2000 base + 100 delivery - 10% discount on the base = 1900, plus the 500 quote outside the 30d window.
    expect(summary).toMatchObject({
      newlySent30dValue: 1900,
      openPipelineCount: 2,
      openPipelineValue: 2400,
    });
  });

  test('includes custom sent quote value in the pipeline totals', async ({ context }) => {
    const [customQuote] = await createQuoteRows(context.db, {
      customerId: context.customer.id,
      deliveryIncluded: false,
      deliveryPrice: 50,
      discountPercent: 10,
      kind: 'custom',
      productId: null,
      quotedBasePrice: 0,
      salesPersonId: context.salesPerson.id,
      statuses: ['sent'],
      statusChangedAt: zonedInstant('2026-05-20T09:00:00'),
      workTitle: 'Pipeline repair',
    });
    if (!customQuote) throw new Error('Expected custom sent quote row');
    const [workItem] = await context.db
      .insert(quoteWorkItems)
      .values({ department: 'fabrication', hourlyRate: 550, hours: 2, quoteId: customQuote.id })
      .returning();
    if (!workItem) throw new Error('Expected custom work item row');
    await context.db
      .insert(quoteWorkItemParts)
      .values({ name: 'Fuel', quantity: 1, unitPrice: 100, workItemId: workItem.id });

    // 2 x R550 labour + R100 parts, less 10% discount, plus R50 delivery.
    await expect(summarizeQuotePipeline({ clock: fixedClock, db: context.db })).resolves.toMatchObject({
      newlySent30dValue: 1130,
      openPipelineCount: 1,
      openPipelineValue: 1130,
    });
  });

  test('adds active and scheduled Jobs at retail and drops Jobs whose Slots are all done', async ({ context }) => {
    // Bay origin is the Monday of plant today's week, so sequenced Slots straddle plant today.
    const currentBay = await createBayRow(context.db, { name: 'Pipeline Current Bay', scheduleOrigin: '2026-06-01' });
    const futureBay = await createBayRow(context.db, { name: 'Pipeline Future Bay', scheduleOrigin: '2026-07-06' });
    const [doneQuote, activeQuote, scheduledQuote, cancelledQuote, unscheduledQuote] = await createQuoteRows(
      context.db,
      {
        customerId: context.customer.id,
        productId: context.product.id,
        quotedBasePrice: 1000,
        salesPersonId: context.salesPerson.id,
        statuses: ['accepted', 'accepted', 'accepted', 'cancelled', 'accepted'],
        statusChangedAt: zonedInstant('2026-05-20T09:00:00'),
      },
    );
    if (!doneQuote || !activeQuote || !scheduledQuote || !cancelledQuote || !unscheduledQuote) {
      throw new Error('Expected five job-backed quote rows');
    }
    // Sequence 1 finishes on 2026-06-01, sequence 2 then runs 10 working days across plant today.
    await createJobRow(context.db, { bayId: currentBay.id, durationDays: 1, quoteId: doneQuote.id, sequence: 1 });
    await createJobRow(context.db, { bayId: currentBay.id, durationDays: 10, quoteId: activeQuote.id, sequence: 2 });
    await createJobRow(context.db, { bayId: futureBay.id, durationDays: 2, quoteId: scheduledQuote.id, sequence: 1 });
    await createJobRow(context.db, {
      bayId: futureBay.id,
      cancelled: true,
      durationDays: 2,
      quoteId: cancelledQuote.id,
      sequence: 2,
    });
    // A Job with no Slot is neither active nor scheduled, so it carries no pipeline value.
    await createJobRow(context.db, { quoteId: unscheduledQuote.id });

    await expect(summarizeQuotePipeline({ clock: fixedClock, db: context.db })).resolves.toMatchObject({
      openPipelineCount: 2,
      openPipelineValue: 2000,
    });
  });

  test('counts a sent Quote that already carries an active Job only once', async ({ context }) => {
    const bay = await createBayRow(context.db, { name: 'Pipeline Sent Job Bay', scheduleOrigin: '2026-06-01' });
    const [sentQuote] = await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      quotedBasePrice: 1000,
      salesPersonId: context.salesPerson.id,
      statuses: ['sent'],
      statusChangedAt: zonedInstant('2026-05-20T09:00:00'),
    });
    if (!sentQuote) throw new Error('Expected sent quote row');
    await createJobRow(context.db, { bayId: bay.id, durationDays: 10, quoteId: sentQuote.id, sequence: 1 });

    await expect(summarizeQuotePipeline({ clock: fixedClock, db: context.db })).resolves.toMatchObject({
      openPipelineCount: 1,
      openPipelineValue: 1000,
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
      openPipelineCount: 0,
      openPipelineValue: 0,
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
    const [oldestQuote] = await createQuoteRows(context.db, {
      customerId: context.customer.id,
      deliveryIncluded: false,
      deliveryPrice: 50,
      productId: context.product.id,
      quotedBasePrice: 3000,
      salesPersonId: context.salesPerson.id,
      statuses: ['sent'],
      statusChangedAt: zonedInstant('2026-05-20T09:00:00'),
    });
    if (!oldestQuote) throw new Error('Expected oldest sent quote row');
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
      totalValue: 3507.5,
    });
    expect(result.items[1]).toMatchObject({
      sentDaysAgo: 3,
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

    const result = await listStaleSentQuotes({ clock: fixedClock, db: context.db });

    // 3 x R320 labour + R100 parts, plus VAT.
    expect(result.items).toEqual([
      expect.objectContaining({
        id: customQuote.id,
        sentDaysAgo: 15,
        totalValue: 1219,
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

    const result = await listStaleSentQuotes({ clock: fixedClock, db: context.db });

    expect(result.items).toHaveLength(8);
  });
});

// Johannesburg wall-clock instants keep window boundary tests aligned with plant business dates.
function zonedInstant(johannesburgLocalTime: string): Date {
  return new Date(`${johannesburgLocalTime}+02:00`);
}

async function createBayRow(db: Db, { name, scheduleOrigin }: { name: string; scheduleOrigin: string }) {
  const [bay] = await db.insert(jobBays).values({ department: 'assembly', name, scheduleOrigin }).returning();

  if (!bay) throw new Error('Expected bay row');

  return bay;
}

async function createJobRow(
  db: Db,
  {
    bayId,
    cancelled = false,
    durationDays,
    quoteId,
    sequence,
  }: { bayId?: string; cancelled?: boolean; durationDays?: number; quoteId: string; sequence?: number },
) {
  const [job] = await db
    .insert(jobs)
    .values({ cancelledAt: cancelled ? new Date() : null, quoteId })
    .returning();

  if (!job) throw new Error('Expected job row');

  if (bayId !== undefined && durationDays !== undefined && sequence !== undefined) {
    await db.insert(jobSlots).values({ bayId, durationDays, jobId: job.id, kind: 'work', sequence });
  }

  return job;
}

async function createQuoteRows(
  db: Db,
  {
    createdAt,
    customerId,
    deliveryIncluded = true,
    deliveryPrice = 0,
    discountPercent = 0,
    kind = 'product',
    productId,
    quotedBasePrice = 1000,
    salesPersonId,
    statuses,
    statusChangedAt,
    workTitle = null,
  }: {
    createdAt?: Date;
    customerId: string;
    deliveryIncluded?: boolean;
    deliveryPrice?: number;
    discountPercent?: number;
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
        deliveryIncluded,
        deliveryPrice,
        discountPercent,
        kind,
        productId,
        quotedBasePrice,
        quotedCurrencyCode: 'ZAR',
        salesPersonId,
        status,
        workTitle,
      })),
    )
    .returning();
}
