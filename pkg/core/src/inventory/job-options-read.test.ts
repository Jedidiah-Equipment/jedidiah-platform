import { customers, jobStockCloseOuts, jobs, quotes } from '@pkg/db';
import type { InventoryJobOptionListInput } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { actorUserId, test } from '../test/inventory-fixtures.js';
import { listInventoryJobOptions } from './job-options-read.js';

const page = { cursor: 0, limit: 20 };

function input(overrides: Partial<InventoryJobOptionListInput> = {}): InventoryJobOptionListInput {
  return { ...page, movementType: 'return-to-store', search: '', tab: 'updated', ...overrides };
}

describe('listInventoryJobOptions', () => {
  test('carries the facts the picker row reads, so a Job is recognised by more than its code', async ({ context }) => {
    const result = await listInventoryJobOptions({ db: context.db, input: input({ search: 'CFO fabrication' }) });

    expect(result.items).toEqual([
      expect.objectContaining({
        code: expect.stringMatching(/^JOB-\d{5}$/),
        customerCompanyName: 'Inventory Customer',
        productName: null,
        quoteKind: 'custom',
        workTitle: 'CFO fabrication',
      }),
    ]);
  });

  /** The Customer is how the stores floor names work nobody wrote a memorable title for. */
  test('finds a Job by its Customer, not only by its code, Product, or work title', async ({ context }) => {
    const result = await listInventoryJobOptions({ db: context.db, input: input({ search: 'Inventory Customer' }) });

    expect(result.total).toBe(2);
  });

  test('leaves out a Job whose Customer does not match the search', async ({ context }) => {
    const [other] = await context.db.insert(customers).values({ companyName: 'Ridgeway Haulage' }).returning();
    if (!other) throw new Error('Customer insert did not return a row');
    const [quote] = await context.db
      .insert(quotes)
      .values({
        customerId: other.id,
        kind: 'custom',
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: actorUserId,
        status: 'accepted',
        workTitle: 'Trailer deck',
      })
      .returning();
    if (!quote) throw new Error('Quote insert did not return a row');
    await context.db.insert(jobs).values({ quoteId: quote.id });

    const result = await listInventoryJobOptions({ db: context.db, input: input({ search: 'Ridgeway' }) });

    expect(result.items.map((job) => job.workTitle)).toEqual(['Trailer deck']);
  });

  test('orders the Last updated tab by when each Job last moved', async ({ context }) => {
    const [first, second] = await context.db.select({ id: jobs.id }).from(jobs).orderBy(jobs.id);
    if (!first || !second) throw new Error('Expected the fixture to seed two Jobs');
    await context.db
      .update(jobs)
      .set({ updatedAt: new Date('2026-08-20T08:00:00.000Z') })
      .where(eq(jobs.id, second.id));
    await context.db
      .update(jobs)
      .set({ updatedAt: new Date('2026-08-10T08:00:00.000Z') })
      .where(eq(jobs.id, first.id));

    const result = await listInventoryJobOptions({ db: context.db, input: input({ tab: 'updated' }) });

    expect(result.items.map((job) => job.id)).toEqual([second.id, first.id]);
  });

  test('orders the Last created tab by when each Job was raised, which the updated order can disagree with', async ({
    context,
  }) => {
    const [first, second] = await context.db.select({ id: jobs.id }).from(jobs).orderBy(jobs.id);
    if (!first || !second) throw new Error('Expected the fixture to seed two Jobs');
    await context.db
      .update(jobs)
      .set({ createdAt: new Date('2026-08-02T08:00:00.000Z'), updatedAt: new Date('2026-08-02T08:00:00.000Z') })
      .where(eq(jobs.id, first.id));
    await context.db
      .update(jobs)
      .set({ createdAt: new Date('2026-08-01T08:00:00.000Z'), updatedAt: new Date('2026-08-30T08:00:00.000Z') })
      .where(eq(jobs.id, second.id));

    const created = await listInventoryJobOptions({ db: context.db, input: input({ tab: 'created' }) });
    const updated = await listInventoryJobOptions({ db: context.db, input: input({ tab: 'updated' }) });

    expect(created.items.map((job) => job.id)).toEqual([first.id, second.id]);
    expect(updated.items.map((job) => job.id)).toEqual([second.id, first.id]);
  });

  test('drops a completed Job from the Non-complete tab while the recency tabs keep it', async ({ context }) => {
    const [completed] = await context.db.select({ id: jobs.id }).from(jobs).orderBy(jobs.id);
    if (!completed) throw new Error('Expected the fixture to seed a Job');
    await context.db.update(jobs).set({ completedOn: '2026-08-15' }).where(eq(jobs.id, completed.id));

    const incomplete = await listInventoryJobOptions({ db: context.db, input: input({ tab: 'incomplete' }) });
    const updated = await listInventoryJobOptions({ db: context.db, input: input({ tab: 'updated' }) });

    expect(incomplete.items.map((job) => job.id)).not.toContain(completed.id);
    expect(updated.items.map((job) => job.id)).toContain(completed.id);
  });

  test('refuses a cancelled Job for Checkout on every tab, while Return still reaches it', async ({ context }) => {
    const [cancelled] = await context.db.select({ id: jobs.id }).from(jobs).orderBy(jobs.id);
    if (!cancelled) throw new Error('Expected the fixture to seed a Job');
    await context.db
      .update(jobs)
      .set({ cancelledAt: new Date('2026-08-12T08:00:00.000Z') })
      .where(eq(jobs.id, cancelled.id));

    const checkout = await listInventoryJobOptions({ db: context.db, input: input({ movementType: 'checkout' }) });
    const returned = await listInventoryJobOptions({
      db: context.db,
      input: input({ movementType: 'return-to-store' }),
    });

    expect(checkout.items.map((job) => job.id)).not.toContain(cancelled.id);
    expect(returned.items.map((job) => job.id)).toContain(cancelled.id);
  });

  test('refuses a closed-out Job for Checkout, whose stock life has ended', async ({ context }) => {
    const [closedOut] = await context.db.select({ id: jobs.id }).from(jobs).orderBy(jobs.id);
    if (!closedOut) throw new Error('Expected the fixture to seed a Job');
    await context.db.insert(jobStockCloseOuts).values({ actorUserId, jobId: closedOut.id });

    const checkout = await listInventoryJobOptions({ db: context.db, input: input({ movementType: 'checkout' }) });

    expect(checkout.items.map((job) => job.id)).not.toContain(closedOut.id);
  });

  test('pages the tab rather than truncating it, reporting the whole match count', async ({ context }) => {
    const result = await listInventoryJobOptions({ db: context.db, input: input({ limit: 1 }) });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(2);
    expect(result.nextCursor).toBe(1);
  });
});
