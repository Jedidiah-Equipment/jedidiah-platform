import {
  customers,
  type Db,
  jobBayCalendarExceptions,
  jobBays,
  jobSlots,
  jobs,
  productBays,
  products,
  quotes,
  user,
  workingCalendarOffDays,
} from '@pkg/db';
import { addDateOnlyDays, addJobSlotDuration, getPlantDateNow } from '@pkg/domain';
import { formatJobCode, type QuoteStatus } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import {
  countQuotesByWeek,
  getQuote,
  getQuoteProductBayAvailability,
  listPriorityQuotes,
  summarizeQuotesByStatus,
} from './quote-service.js';

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
      modelCode: 'QUOTE-SUMMARY-001',
      name: 'Quote Summary Product',
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

describe('countQuotesByWeek', () => {
  const fixedClock = () => new Date('2026-06-04T10:00:00.000Z');

  test('returns a 12-week Johannesburg series with empty weeks zero-filled', async ({ context }) => {
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['draft'],
      createdAt: new Date('2026-05-18T08:00:00.000Z'),
    });
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['sent', 'accepted'],
      createdAt: new Date('2026-05-26T08:00:00.000Z'),
    });
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['draft'],
      createdAt: new Date('2026-05-31T22:30:00.000Z'),
    });
    await createQuoteRows(context.db, {
      customerId: context.customer.id,
      productId: context.product.id,
      salesPersonId: context.salesPerson.id,
      statuses: ['cancelled'],
      createdAt: new Date('2026-03-15T21:59:59.000Z'),
    });

    await expect(countQuotesByWeek({ clock: fixedClock, db: context.db })).resolves.toEqual({
      items: [
        { count: 0, weekStartDate: '2026-03-16' },
        { count: 0, weekStartDate: '2026-03-23' },
        { count: 0, weekStartDate: '2026-03-30' },
        { count: 0, weekStartDate: '2026-04-06' },
        { count: 0, weekStartDate: '2026-04-13' },
        { count: 0, weekStartDate: '2026-04-20' },
        { count: 0, weekStartDate: '2026-04-27' },
        { count: 0, weekStartDate: '2026-05-04' },
        { count: 0, weekStartDate: '2026-05-11' },
        { count: 1, weekStartDate: '2026-05-18' },
        { count: 2, weekStartDate: '2026-05-25' },
        { count: 1, weekStartDate: '2026-06-01' },
      ],
    });
  });

  test('returns a flat zero series when the whole window is empty', async ({ context }) => {
    await expect(countQuotesByWeek({ clock: fixedClock, db: context.db })).resolves.toEqual({
      items: [
        { count: 0, weekStartDate: '2026-03-16' },
        { count: 0, weekStartDate: '2026-03-23' },
        { count: 0, weekStartDate: '2026-03-30' },
        { count: 0, weekStartDate: '2026-04-06' },
        { count: 0, weekStartDate: '2026-04-13' },
        { count: 0, weekStartDate: '2026-04-20' },
        { count: 0, weekStartDate: '2026-04-27' },
        { count: 0, weekStartDate: '2026-05-04' },
        { count: 0, weekStartDate: '2026-05-11' },
        { count: 0, weekStartDate: '2026-05-18' },
        { count: 0, weekStartDate: '2026-05-25' },
        { count: 0, weekStartDate: '2026-06-01' },
      ],
    });
  });

  test('uses the injected plant date when the UTC day rolls into a Johannesburg Monday', async ({ context }) => {
    const rolloverClock = () => new Date('2026-01-04T22:00:00.000Z');

    await expect(countQuotesByWeek({ clock: rolloverClock, db: context.db, weekCount: 1 })).resolves.toEqual({
      items: [{ count: 0, weekStartDate: '2026-01-05' }],
    });
  });
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
      productBays: [
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

    await expect(getQuote({ db: context.db, id: quote.id })).resolves.toMatchObject({ productBays: [] });
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
        productId: quote.productId,
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

async function createQuoteRows(
  db: Db,
  {
    createdAt,
    customerId,
    productId,
    salesPersonId,
    statuses,
  }: {
    createdAt?: Date;
    customerId: string;
    productId: string;
    salesPersonId: string;
    statuses: QuoteStatus[];
  },
) {
  await db.insert(quotes).values(
    statuses.map((status) => ({
      customerId,
      ...(createdAt ? { createdAt, updatedAt: createdAt } : {}),
      productId,
      quotedBasePrice: 1000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId,
      status,
    })),
  );
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
