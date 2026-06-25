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
import type { FeedbackStatus } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester, type TesterContext } from '@/test/create-tester.js';
import { createProductRangeFixture } from '@/test/product-range-fixtures.js';
import { mockSession } from '@/test/test-utils.js';

const ACTOR_THUMBNAIL_DATA_URL = 'data:image/webp;base64,YWN0b3I=';
const TARGET_THUMBNAIL_DATA_URL = 'data:image/webp;base64,dGFyZ2V0';

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

describe('feedback review reads', () => {
  test('denies feedback list and detail reads to admin users', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));

    await expect(adminCaller.feedback.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(adminCaller.feedback.openCount()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(adminCaller.feedback.get({ id: '00000000-0000-4000-8000-000000000621' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('lists feedback for super-admin users and filters by status', async ({ context }) => {
    const submitterCaller = context.createCaller(mockSession('sales'));
    const openFeedback = await submitterCaller.feedback.submit({
      kind: 'general',
      subject: { subjectType: 'quote', quoteId: context.quote.id },
      text: 'Open feedback should appear.',
    });
    const closedFeedback = await submitterCaller.feedback.submit({
      kind: 'general',
      subject: { subjectType: 'job', jobId: context.job.id },
      text: 'Closed feedback should filter out.',
    });
    await context.db.update(feedback).set({ status: 'closed' }).where(eq(feedback.id, closedFeedback.id));

    const reviewerCaller = context.createCaller(mockSession('super-admin'));

    await expect(reviewerCaller.feedback.list({})).resolves.toMatchObject({
      items: [
        {
          id: closedFeedback.id,
          status: 'closed',
          subject: { subjectType: 'job' },
        },
        {
          id: openFeedback.id,
          status: 'open',
          subject: { subjectType: 'quote' },
        },
      ],
    });
    await expect(reviewerCaller.feedback.list({ status: 'open' })).resolves.toMatchObject({
      items: [{ id: openFeedback.id, status: 'open' }],
    });
  });

  test('counts only open feedback and drops to zero when the last open item is resolved', async ({ context }) => {
    const firstOpen = await createGeneralFeedback(context);
    const secondOpen = await createGeneralFeedback(context);
    await context.db.update(feedback).set({ status: 'closed' }).where(eq(feedback.id, firstOpen.id));

    const reviewerCaller = context.createCaller(mockSession('super-admin'));

    await expect(reviewerCaller.feedback.openCount()).resolves.toBe(1);

    await reviewerCaller.feedback.update({
      id: secondOpen.id,
      status: 'resolved',
    });

    await expect(reviewerCaller.feedback.openCount()).resolves.toBe(0);
  });

  test('returns read-only feedback detail with text and targets for super-admin users', async ({ context }) => {
    const targetUser = await createTargetUser(context.db, 'detail-target-user-id');
    const submitterCaller = context.createCaller(mockSession('sales'));
    const submitted = await submitterCaller.feedback.submit({
      kind: 'corrective-feedback-user',
      subject: { subjectType: 'quote', quoteId: context.quote.id },
      text: 'Follow up with this user.',
      userIds: [targetUser.id],
    });

    const detail = await context.createCaller(mockSession('super-admin')).feedback.get({ id: submitted.id });

    expect(detail).toMatchObject({
      id: submitted.id,
      kind: 'corrective-feedback-user',
      status: 'open',
      subject: {
        id: context.quote.id,
        subjectType: 'quote',
      },
      submitter: {
        email: 'test@example.com',
        id: 'test-user-id',
        name: 'Test User',
        thumbnailDataUrl: ACTOR_THUMBNAIL_DATA_URL,
      },
      text: 'Follow up with this user.',
      users: [{ id: targetUser.id, name: targetUser.name, thumbnailDataUrl: TARGET_THUMBNAIL_DATA_URL }],
    });
  });
});

describe('feedback.update', () => {
  const statusTransitions = [
    ['open', 'resolved'],
    ['resolved', 'open'],
    ['open', 'closed'],
    ['closed', 'open'],
    ['resolved', 'closed'],
    ['closed', 'resolved'],
  ] as const satisfies readonly (readonly [FeedbackStatus, FeedbackStatus])[];

  for (const [fromStatus, toStatus] of statusTransitions) {
    test(`moves status from ${fromStatus} to ${toStatus}`, async ({ context }) => {
      const submitted = await createGeneralFeedback(context);
      await context.db.update(feedback).set({ status: fromStatus }).where(eq(feedback.id, submitted.id));

      const updated = await context.createCaller(mockSession('super-admin')).feedback.update({
        id: submitted.id,
        status: toStatus,
      });

      expect(updated).toMatchObject({ id: submitted.id, status: toStatus });
      await expect(context.db.select().from(feedback).where(eq(feedback.id, submitted.id))).resolves.toMatchObject([
        { status: toStatus },
      ]);
    });
  }

  test('persists internal notes and allows clearing them', async ({ context }) => {
    const submitted = await createGeneralFeedback(context);
    const caller = context.createCaller(mockSession('super-admin'));

    const withNotes = await caller.feedback.update({
      id: submitted.id,
      internalNotes: 'Customer phoned back; follow up after dispatch.',
    });

    expect(withNotes).toMatchObject({
      id: submitted.id,
      internalNotes: 'Customer phoned back; follow up after dispatch.',
    });

    const cleared = await caller.feedback.update({ id: submitted.id, internalNotes: '' });

    expect(cleared).toMatchObject({ id: submitted.id, internalNotes: null });
    await expect(context.db.select().from(feedback).where(eq(feedback.id, submitted.id))).resolves.toMatchObject([
      { internalNotes: null },
    ]);
  });

  test('rejects updating feedback that has already been deleted', async ({ context }) => {
    const submitted = await createGeneralFeedback(context);
    await context.db.delete(feedback).where(eq(feedback.id, submitted.id));

    await expect(
      context.createCaller(mockSession('super-admin')).feedback.update({
        id: submitted.id,
        status: 'resolved',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('denies update to admin users', async ({ context }) => {
    const submitted = await createGeneralFeedback(context);

    await expect(
      context.createCaller(mockSession('admin')).feedback.update({
        id: submitted.id,
        internalNotes: 'Admin users cannot triage feedback.',
        status: 'resolved',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(context.db.select().from(feedback).where(eq(feedback.id, submitted.id))).resolves.toMatchObject([
      { internalNotes: null, status: 'open' },
    ]);
  });
});

async function createGeneralFeedback(context: TesterContext & { quote: Awaited<ReturnType<typeof createQuote>> }) {
  return context.createCaller(mockSession('sales')).feedback.submit({
    kind: 'general',
    subject: { subjectType: 'quote', quoteId: context.quote.id },
    text: 'Feedback awaiting triage.',
  });
}

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    image: ACTOR_THUMBNAIL_DATA_URL,
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
      image: TARGET_THUMBNAIL_DATA_URL,
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
