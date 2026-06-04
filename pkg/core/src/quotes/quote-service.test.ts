import { customers, type Db, products, quotes, user } from '@pkg/db';
import type { QuoteStatus } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { countQuotesByWeek, summarizeQuotesByStatus } from './quote-service.js';

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
});

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
