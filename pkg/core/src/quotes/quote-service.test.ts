import { customers, type Db, products, quotes, user } from '@pkg/db';
import type { QuoteStatus } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { summarizeQuotesByStatus } from './quote-service.js';

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

async function createQuoteRows(
  db: Db,
  {
    customerId,
    productId,
    salesPersonId,
    statuses,
  }: {
    customerId: string;
    productId: string;
    salesPersonId: string;
    statuses: QuoteStatus[];
  },
) {
  await db.insert(quotes).values(
    statuses.map((status) => ({
      customerId,
      productId,
      quotedBasePrice: 1000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId,
      status,
    })),
  );
}
