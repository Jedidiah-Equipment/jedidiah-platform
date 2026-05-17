import { auditEvents, type Db, jobStages, jobs, products, quotes, user } from '@pkg/db';
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
      discount: 100,
      notes: 'Demo quote',
      productId: context.product.id,
      salesPersonId: 'test-user-id',
      validUntil: '2026-06-30',
    });

    const quoteRows = await context.db.select().from(quotes);
    const events = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);

    expect(created).toMatchObject({
      code: 'QUO-00001',
      customerCompanyName: 'Acme Mining',
      productId: context.product.id,
      status: 'draft',
      total: context.product.basePrice - 100,
    });
    expect(quoteRows).toHaveLength(1);
    expect(events.map((event) => event.entityType)).toEqual(['customer', 'quote']);
  });
});

describe('quotes.send', () => {
  test('snapshots the product price and freezes later edits', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const created = await createReadyQuote(caller, context.product.id);
    const sent = await caller.quotes.send({ id: created.id });

    await context.db.update(products).set({ basePrice: 999_999 });
    const afterReprice = await caller.quotes.get({ id: sent.id });

    expect(sent).toMatchObject({
      quotedBasePrice: context.product.basePrice,
      quotedCurrencyCode: 'ZAR',
      status: 'sent',
      total: context.product.basePrice - created.discount,
    });
    expect(afterReprice.total).toBe(sent.total);
    await expect(
      caller.quotes.update({
        ...toUpdateInput(sent),
        notes: 'This should not save',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('jobs.createFromQuote', () => {
  test('converts an accepted quote into one job with stages', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const created = await createReadyQuote(salesCaller, context.product.id);
    const sent = await salesCaller.quotes.send({ id: created.id });
    const accepted = await salesCaller.quotes.accept({ id: sent.id });

    const job = await supervisorCaller.jobs.createFromQuote({
      dueDate: '2026-08-15',
      quoteId: accepted.id,
    });
    const jobRows = await context.db.select().from(jobs);
    const stageRows = await context.db.select().from(jobStages);

    expect(job).toMatchObject({
      dueDate: '2026-08-15',
      productId: context.product.id,
      quoteId: accepted.id,
    });
    expect(jobRows).toHaveLength(1);
    expect(stageRows).toHaveLength(5);
    await expect(supervisorCaller.jobs.createFromQuote({ quoteId: accepted.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

async function createReadyQuote(caller: AppRouterCaller, productId: string) {
  return caller.quotes.create({
    customer: {
      type: 'inline',
      companyName: 'Ready Customer',
    },
    discount: 250,
    notes: null,
    productId,
    salesPersonId: 'test-user-id',
    validUntil: '2026-06-30',
  });
}

function toUpdateInput(quote: QuoteDetail) {
  return {
    id: quote.id,
    customer: {
      type: 'existing' as const,
      customerId: quote.customerId,
    },
    discount: quote.discount,
    notes: quote.notes,
    productId: quote.productId,
    salesPersonId: quote.salesPersonId ?? 'test-user-id',
    validUntil: quote.validUntil,
  };
}

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role: 'sales',
    updatedAt: now,
  });
}

async function createProduct(db: Db) {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1000,
      currencyCode: 'ZAR',
      modelCode: 'QUOTE-001',
      name: 'Quote Test Product',
    })
    .returning();

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
}
