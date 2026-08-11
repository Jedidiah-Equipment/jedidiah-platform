import {
  customers,
  type Db,
  feedback,
  jobs,
  products,
  productUnitOwnershipTransfers,
  productUnits,
  quotes,
  user,
} from '@pkg/db';
import { formatJobCode } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { listJobActivity } from './job-activity-service.js';

const SUBMITTER_THUMBNAIL_DATA_URL = 'data:image/webp;base64,YWN0b3I=';

const test = createTester(async ({ db }) => {
  await createSubmitter(db);
  const product = await createProduct(db);
  const quote = await createQuote(db, product.id);
  const job = await createJob(db, { customerId: quote.customerId, productId: product.id, quoteId: quote.id });

  return { db, job, product, quote };
});

describe('listJobActivity', () => {
  test('returns a Job general feedback row as a general-feedback activity item', async ({ context }) => {
    await insertFeedback(context.db, {
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Paint bay handover was missed on this job.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      type: 'general-feedback',
      job: { id: context.job.id },
      feedback: {
        submitter: {
          id: 'test-user-id',
          name: 'Test User',
          thumbnailDataUrl: SUBMITTER_THUMBNAIL_DATA_URL,
        },
        text: 'Paint bay handover was missed on this job.',
      },
    });
  });

  test('places the item by Job code, Product, serial, and the Customer who bought it', async ({ context }) => {
    await insertFeedback(context.db, {
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Placed item.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items[0]?.job).toMatchObject({
      code: formatJobCode(context.job.code),
      customerCompanyName: 'Activity Customer',
      displayName: 'Job Activity Test Product',
      serialNumber: 'FB-26-0001',
    });
  });

  test('reads a Job whose Unit nobody owns as Stock, carrying no Customer', async ({ context }) => {
    const stockJob = await createStockJob(context.db, context.product.id);

    await insertFeedback(context.db, {
      jobId: stockJob.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Stock build note.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items[0]?.job).toMatchObject({
      customerCompanyName: null,
      displayName: 'Job Activity Test Product',
      serialNumber: 'FB-26-0002',
    });
  });

  test('never returns Quote general feedback, which stays private to the inbox (ADR 0010)', async ({ context }) => {
    await insertFeedback(context.db, {
      quoteId: context.quote.id,
      kind: 'general',
      subjectType: 'quote',
      text: 'The discount on this quote looks too high.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  test('never returns corrective feedback about a Job', async ({ context }) => {
    await insertFeedback(context.db, {
      jobId: context.job.id,
      kind: 'corrective-feedback-department',
      subjectType: 'job',
      text: 'Paint department keeps missing handovers.',
    });
    await insertFeedback(context.db, {
      jobId: context.job.id,
      kind: 'corrective-feedback-user',
      subjectType: 'job',
      text: 'This fitter keeps missing handovers.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  test('orders newest first, breaking ties on id so a cursor never repeats a row', async ({ context }) => {
    const sharedInstant = new Date('2026-08-01T09:00:00.000Z');

    await insertFeedback(context.db, {
      createdAt: new Date('2026-08-02T09:00:00.000Z'),
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Newest.',
    });
    await insertFeedback(context.db, {
      createdAt: sharedInstant,
      id: '00000000-0000-4000-8000-000000000002',
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Tied, higher id.',
    });
    await insertFeedback(context.db, {
      createdAt: sharedInstant,
      id: '00000000-0000-4000-8000-000000000001',
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Tied, lower id.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    // Newest first, and the tie broken by descending id so the sort matches the index's own order.
    expect(result.items.map((item) => item.feedback.text)).toEqual(['Newest.', 'Tied, higher id.', 'Tied, lower id.']);
  });

  test('pages with a server-computed cursor that terminates on the last page', async ({ context }) => {
    for (let index = 0; index < 3; index += 1) {
      await insertFeedback(context.db, {
        createdAt: new Date(`2026-08-0${index + 1}T09:00:00.000Z`),
        jobId: context.job.id,
        kind: 'general',
        subjectType: 'job',
        text: `Item ${index}`,
      });
    }

    const firstPage = await listJobActivity({ db: context.db, input: listInput({ limit: 2 }) });

    expect(firstPage.total).toBe(3);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBe(2);

    const secondPage = await listJobActivity({
      db: context.db,
      input: listInput({ cursor: firstPage.nextCursor ?? 0, limit: 2 }),
    });

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
  });

  test('terminates rather than looping when the cursor sits past the end', async ({ context }) => {
    await insertFeedback(context.db, {
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Only item.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput({ cursor: 50, limit: 25 }) });

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  test('returns every row unpaged for the limit 0 sentinel', async ({ context }) => {
    for (let index = 0; index < 3; index += 1) {
      await insertFeedback(context.db, {
        createdAt: new Date(`2026-08-0${index + 1}T09:00:00.000Z`),
        jobId: context.job.id,
        kind: 'general',
        subjectType: 'job',
        text: `Item ${index}`,
      });
    }

    const result = await listJobActivity({ db: context.db, input: listInput({ limit: 0 }) });

    expect(result.items).toHaveLength(3);
    expect(result.nextCursor).toBeNull();
  });

  test('orders oldest first when the caller asks for ascending', async ({ context }) => {
    await insertFeedback(context.db, {
      createdAt: new Date('2026-08-02T09:00:00.000Z'),
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Newer.',
    });
    await insertFeedback(context.db, {
      createdAt: new Date('2026-08-01T09:00:00.000Z'),
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Older.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput({ sortDirection: 'asc' }) });

    expect(result.items.map((item) => item.feedback.text)).toEqual(['Older.', 'Newer.']);
  });
});

function listInput(overrides: Partial<Parameters<typeof listJobActivity>[0]['input']> = {}) {
  return {
    cursor: 0,
    limit: 25,
    sortBy: 'occurredAt' as const,
    sortDirection: 'desc' as const,
    ...overrides,
  };
}

async function insertFeedback(db: Db, values: Omit<typeof feedback.$inferInsert, 'submitterId'>) {
  await db.insert(feedback).values({ ...values, submitterId: 'test-user-id' });
}

async function createSubmitter(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    image: SUBMITTER_THUMBNAIL_DATA_URL,
    name: 'Test User',
    role: 'admin',
    updatedAt: now,
  });
}

async function createProduct(db: Db) {
  const rangeId = await createProductRangeFixture(db);
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      modelCode: 'ACTIVITY-001',
      name: 'Job Activity Test Product',
      rangeId,
    })
    .returning();

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
}

async function createQuote(db: Db, productId: string) {
  const [customer] = await db.insert(customers).values({ companyName: 'Activity Customer', email: null }).returning();

  if (!customer) {
    throw new Error('Customer insert did not return a row');
  }

  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      productId,
      quotedBasePrice: 1000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'test-user-id',
    })
    .returning();

  if (!quote) {
    throw new Error('Quote insert did not return a row');
  }

  return quote;
}

/** A Stock Build: its own Unit, no Quote, so no Customer bought it. */
async function createStockJob(db: Db, productId: string) {
  const [unit] = await db
    .insert(productUnits)
    .values({
      productId,
      productSerialNumber: 'FB-26-0002',
      productSerialPrefix: 'FB',
      productSerialSequence: 2,
      productSerialYear: 26,
    })
    .returning({ id: productUnits.id });

  if (!unit) {
    throw new Error('Product unit insert did not return a row');
  }

  const [job] = await db.insert(jobs).values({ productUnitId: unit.id, quoteId: null }).returning();

  if (!job) {
    throw new Error('Job insert did not return a row');
  }

  return job;
}

async function createJob(
  db: Db,
  { customerId, productId, quoteId }: { customerId: string; productId: string; quoteId: string },
) {
  const [unit] = await db
    .insert(productUnits)
    .values({
      productId,
      productSerialNumber: 'FB-26-0001',
      productSerialPrefix: 'FB',
      productSerialSequence: 1,
      productSerialYear: 26,
    })
    .returning({ id: productUnits.id });

  if (!unit) {
    throw new Error('Product unit insert did not return a row');
  }

  // A sold machine leaves Stock through the ownership log, which is where its Customer is read from.
  await db.insert(productUnitOwnershipTransfers).values({
    occurredOn: '2026-08-01',
    productUnitId: unit.id,
    sourceQuoteId: quoteId,
    toCustomerId: customerId,
  });

  const [job] = await db.insert(jobs).values({ productUnitId: unit.id, quoteId }).returning();

  if (!job) {
    throw new Error('Job insert did not return a row');
  }

  return job;
}
