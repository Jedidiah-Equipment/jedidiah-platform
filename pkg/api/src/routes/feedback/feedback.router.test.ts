import { customers, type Db, feedback, jobs, products, quotes, user } from '@pkg/db';
import { describe, expect } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { createProductRangeFixture } from '@/test/product-range-fixtures.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  const product = await createProduct(db);
  const quote = await createQuote(db, product.id);
  const job = await createJob(db, { productId: product.id, quoteId: quote.id });

  return {
    db,
    job,
    quote,
  };
});

describe('feedback.submit', () => {
  test('persists general feedback on a Quote with the submitter taken from the session', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    const submitted = await caller.feedback.submit({
      kind: 'general',
      subject: { subjectType: 'quote', quoteId: context.quote.id },
      text: 'The discount on this quote looks too high.',
    });

    const rows = await context.db.select().from(feedback);

    expect(submitted).toMatchObject({
      jobId: null,
      kind: 'general',
      quoteId: context.quote.id,
      status: 'open',
      subjectType: 'quote',
      submitterId: 'test-user-id',
      text: 'The discount on this quote looks too high.',
    });
    expect(submitted.internalNotes).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      jobId: null,
      kind: 'general',
      quoteId: context.quote.id,
      status: 'open',
      subjectType: 'quote',
      submitterId: 'test-user-id',
    });
  });

  test('persists general feedback on a Job for a caller with job read access', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-viewer'));

    const submitted = await caller.feedback.submit({
      kind: 'general',
      subject: { subjectType: 'job', jobId: context.job.id },
      text: 'Paint bay handover was missed on this job.',
    });

    expect(submitted).toMatchObject({
      jobId: context.job.id,
      quoteId: null,
      subjectType: 'job',
      submitterId: 'test-user-id',
    });
  });

  test('allows a Quote submission from a caller without quote read access', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-viewer'));

    await expect(
      caller.feedback.submit({
        kind: 'general',
        subject: { subjectType: 'quote', quoteId: context.quote.id },
        text: 'Any signed-in user may submit.',
      }),
    ).resolves.toMatchObject({ quoteId: context.quote.id, subjectType: 'quote' });

    await expect(context.db.select().from(feedback)).resolves.toHaveLength(1);
  });

  test('allows a Job submission from a caller without job read access', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    await expect(
      caller.feedback.submit({
        kind: 'general',
        subject: { subjectType: 'job', jobId: context.job.id },
        text: 'Any signed-in user may submit.',
      }),
    ).resolves.toMatchObject({ jobId: context.job.id, subjectType: 'job' });

    await expect(context.db.select().from(feedback)).resolves.toHaveLength(1);
  });

  test('rejects empty feedback text at the input boundary', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    await expect(
      caller.feedback.submit({
        kind: 'general',
        subject: { subjectType: 'quote', quoteId: context.quote.id },
        text: '   ',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  test('rejects feedback about a Quote that does not exist', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    await expect(
      caller.feedback.submit({
        kind: 'general',
        subject: { subjectType: 'quote', quoteId: '00000000-0000-4000-8000-000000000999' },
        text: 'No such quote.',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
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
      modelCode: 'FEEDBACK-001',
      name: 'Feedback Test Product',
      rangeId,
    })
    .returning();

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
}

async function createQuote(db: Db, productId: string) {
  const [customer] = await db.insert(customers).values({ companyName: 'Feedback Customer', email: null }).returning();

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

async function createJob(db: Db, { productId, quoteId }: { productId: string; quoteId: string }) {
  const [job] = await db
    .insert(jobs)
    .values({
      productId,
      productSerialNumber: 'FB-26-0001',
      productSerialPrefix: 'FB',
      productSerialSequence: 1,
      productSerialYear: 26,
      quoteId,
    })
    .returning();

  if (!job) {
    throw new Error('Job insert did not return a row');
  }

  return job;
}
