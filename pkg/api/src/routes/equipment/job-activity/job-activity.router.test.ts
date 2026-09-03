import { auditEvents, customers, type Db, eq, feedback, jobs, products, productUnits, quotes, user } from '@pkg/db';
import { DateIso } from '@pkg/schema';
import { describe, expect } from 'vitest';
import { createProductRangeFixture } from '@/equipment/test/product-range-fixtures.js';
import { createActorUser } from '@/test/actor-user.js';
import { createTester, type TesterContext } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  const product = await createProduct(db);
  const quote = await createQuote(db, product.id);
  const job = await createJob(db, { productId: product.id, quoteId: quote.id });

  return { db, job };
});

describe('jobActivity.list', () => {
  test('serves the feed to a read-only job viewer', async ({ context }) => {
    await createJobGeneralFeedback(context);

    const result = await context.createCaller(mockSession('job-viewer')).jobActivity.list({});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      type: 'general-feedback',
      job: { id: context.job.id },
    });
  });

  test('parses and applies a global search without changing the read permission', async ({ context }) => {
    await createJobGeneralFeedback(context);
    const viewer = context.createCaller(mockSession('job-viewer'));

    const match = await viewer.jobActivity.list({ search: '  HANDOVER  ' });
    const miss = await viewer.jobActivity.list({ search: 'unrelated phrase' });

    expect(match.items).toHaveLength(1);
    expect(match.total).toBe(1);
    expect(miss.items).toEqual([]);
    expect(miss.total).toBe(0);
  });

  // The load-bearing decision of ADR 0015: change events come from `audit_events`, which a job
  // viewer may not read raw, and they still reach that viewer here as curated items.
  test('serves change events to a job viewer who holds no audit read permission', async ({ context }) => {
    await context.db.insert(auditEvents).values({
      action: 'created',
      actorUserId: 'test-user-id',
      changes: { completedOn: { from: null, to: null }, description: { from: null, to: null } },
      entityId: context.job.id,
      entityType: 'job',
      summary: 'Created job "JOB-00001"',
    });

    const viewer = context.createCaller(mockSession('job-viewer'));

    await expect(viewer.audit.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const result = await viewer.jobActivity.list({});

    expect(result.items).toEqual([
      expect.objectContaining({ type: 'job-created', job: expect.objectContaining({ id: context.job.id }) }),
    ]);
  });

  test('denies the feed to roles without job read access', async ({ context }) => {
    for (const role of ['sales', 'stores', 'bay-operator'] as const) {
      await expect(context.createCaller(mockSession(role)).jobActivity.list({})).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    }
  });
});

describe('jobActivity last seen', () => {
  test('advances only through the newest activity returned to the viewer', async ({ context }) => {
    const initial = new Date('2026-08-17T08:00:00.000Z');
    const viewedAt = DateIso.parse('2026-08-18T08:00:00.000Z');
    const unseenAt = DateIso.parse('2026-08-18T08:00:01.000Z');
    await context.db.update(user).set({ lastActivitySeen: initial }).where(eq(user.id, 'test-user-id'));
    await createJobGeneralFeedback(context, { createdAt: viewedAt, text: 'Already loaded by the viewer.' });
    const caller = context.createCaller(mockSession('job-viewer'));

    await expect(caller.jobActivity.getLastActivitySeen()).resolves.toBe(initial.toISOString());

    // This arrives after the feed response but before its acknowledgement reaches the server.
    await createJobGeneralFeedback(context, { createdAt: unseenAt, text: 'Arrived during acknowledgement.' });
    const updated = await caller.jobActivity.setLastActivitySeen({ seenAt: viewedAt });

    expect(updated).toBe(viewedAt);
    await expect(caller.jobActivity.getLastActivitySeen()).resolves.toBe(updated);

    const activityViewAudits = await context.db
      .select({ changes: auditEvents.changes })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, 'test-user-id'));
    expect(activityViewAudits).toContainEqual({
      changes: { lastActivitySeen: { from: initial.toISOString(), to: viewedAt } },
    });
  });

  test('denies both endpoints without job read access', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    await expect(caller.jobActivity.getLastActivitySeen()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      caller.jobActivity.setLastActivitySeen({ seenAt: DateIso.parse('2026-08-18T08:00:00.000Z') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

async function createJobGeneralFeedback(
  context: TesterContext & { db: Db; job: { id: string } },
  overrides: { createdAt?: DateIso; text?: string } = {},
) {
  await context.db.insert(feedback).values({
    createdAt: overrides.createdAt ? new Date(overrides.createdAt) : undefined,
    jobId: context.job.id,
    kind: 'general',
    subjectType: 'job',
    submitterId: 'test-user-id',
    text: overrides.text ?? 'Paint bay handover was missed on this job.',
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

async function createJob(db: Db, { productId, quoteId }: { productId: string; quoteId: string }) {
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

  const [job] = await db.insert(jobs).values({ productUnitId: unit.id, quoteId }).returning();

  if (!job) {
    throw new Error('Job insert did not return a row');
  }

  return job;
}
