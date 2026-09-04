import { customers, jobs, quotes } from '@pkg/db/equipment';
import type { InventoryJobOptionListInput } from '@pkg/schema/equipment';
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
});
