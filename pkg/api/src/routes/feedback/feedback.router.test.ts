import {
  customers,
  type Db,
  eq,
  feedback,
  feedbackDepartment,
  feedbackUser,
  jobs,
  products,
  quotes,
  user,
} from '@pkg/db';
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

  test('persists corrective-department feedback with its department targets', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    const submitted = await caller.feedback.submit({
      kind: 'corrective-feedback-department',
      subject: { subjectType: 'quote', quoteId: context.quote.id },
      text: 'Paint and assembly both missed the spec.',
      departments: ['paint', 'assembly'],
    });

    expect(submitted).toMatchObject({ kind: 'corrective-feedback-department' });
    expect(new Set(submitted.departments)).toEqual(new Set(['paint', 'assembly']));
    expect(submitted.userIds).toEqual([]);

    const targets = await context.db
      .select()
      .from(feedbackDepartment)
      .where(eq(feedbackDepartment.feedbackId, submitted.id));
    expect(new Set(targets.map((row) => row.department))).toEqual(new Set(['paint', 'assembly']));
  });

  test('persists corrective-user feedback with its user targets', async ({ context }) => {
    const targetUser = await createTargetUser(context.db, 'target-user-id');
    const caller = context.createCaller(mockSession('job-viewer'));

    const submitted = await caller.feedback.submit({
      kind: 'corrective-feedback-user',
      subject: { subjectType: 'job', jobId: context.job.id },
      text: 'Handover was skipped.',
      userIds: [targetUser.id],
    });

    expect(submitted).toMatchObject({ kind: 'corrective-feedback-user' });
    expect(submitted.userIds).toEqual([targetUser.id]);
    expect(submitted.departments).toEqual([]);

    const targets = await context.db.select().from(feedbackUser).where(eq(feedbackUser.feedbackId, submitted.id));
    expect(targets.map((row) => row.userId)).toEqual([targetUser.id]);
  });

  test('rejects a corrective-department submission with no targets', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    await expect(
      caller.feedback.submit({
        kind: 'corrective-feedback-department',
        subject: { subjectType: 'quote', quoteId: context.quote.id },
        text: 'Missing the department target.',
        departments: [],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  test('rejects a corrective-user submission with no targets', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    await expect(
      caller.feedback.submit({
        kind: 'corrective-feedback-user',
        subject: { subjectType: 'quote', quoteId: context.quote.id },
        text: 'Missing the user target.',
        userIds: [],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  test('leaves corrective-user feedback intact when a targeted user is deleted', async ({ context }) => {
    const targetUser = await createTargetUser(context.db, 'cascade-target-id');
    const caller = context.createCaller(mockSession('sales'));

    const submitted = await caller.feedback.submit({
      kind: 'corrective-feedback-user',
      subject: { subjectType: 'quote', quoteId: context.quote.id },
      text: 'Deleting this user should drop only the link.',
      userIds: [targetUser.id],
    });

    await context.db.delete(user).where(eq(user.id, targetUser.id));

    const remaining = await context.db.select().from(feedback).where(eq(feedback.id, submitted.id));
    expect(remaining).toHaveLength(1);

    const links = await context.db.select().from(feedbackUser).where(eq(feedbackUser.feedbackId, submitted.id));
    expect(links).toHaveLength(0);
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

async function createTargetUser(db: Db, id: string) {
  const now = new Date();

  const [created] = await db
    .insert(user)
    .values({
      createdAt: now,
      email: `${id}@example.com`,
      emailVerified: true,
      id,
      name: `Target ${id}`,
      role: 'sales',
      updatedAt: now,
    })
    .returning();

  if (!created) {
    throw new Error('Target user insert did not return a row');
  }

  return created;
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
