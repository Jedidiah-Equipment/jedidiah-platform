import { customers, type Db, jobs, parts, purchaseOrders, quotes, supplier, user } from '@pkg/db';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { seedPurchaseOrderDrafts } from './purchase-order-seed-service.js';

const ACTOR_ID = 'po-seed-test-user';
const SUPPLIER_A_ID = '00000000-0000-4000-8000-000000000301';
const SUPPLIER_B_ID = '00000000-0000-4000-8000-000000000302';
const ALPHA_PART_ID = '00000000-0000-4000-8000-000000000401';
const ALPHA_LINEAR_PART_ID = '00000000-0000-4000-8000-000000000402';
const BETA_PART_ID = '00000000-0000-4000-8000-000000000403';
const BUILT_PART_ID = '00000000-0000-4000-8000-000000000404';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    createdAt: new Date(),
    email: 'po-seed@example.com',
    emailVerified: true,
    id: ACTOR_ID,
    name: 'PO Seed Tester',
    role: 'admin',
    updatedAt: new Date(),
  });
  // Named so the per-Supplier split cannot pass by insertion order alone.
  await db.insert(supplier).values([
    { companyName: 'Zeta Steel', id: SUPPLIER_A_ID },
    { companyName: 'Acme Supplies', id: SUPPLIER_B_ID },
  ]);
  await db.insert(parts).values([
    partRow({ code: 'S-100', id: ALPHA_PART_ID, supplierId: SUPPLIER_A_ID }),
    partRow({
      code: 'S-200',
      id: ALPHA_LINEAR_PART_ID,
      standardPurchaseLengthMm: 6_000,
      supplierId: SUPPLIER_A_ID,
      unitOfMeasure: 'mm',
    }),
    partRow({ code: 'S-300', id: BETA_PART_ID, supplierId: SUPPLIER_B_ID }),
    partRow({ code: 'S-400', id: BUILT_PART_ID, isInternallyFabricated: true, supplierId: null }),
  ]);

  return { jobId: await seedJob(db) };
});

describe('seedPurchaseOrderDrafts', () => {
  test('splits one selection into a draft per Supplier, ordered by Supplier name', async ({ context }) => {
    const result = await seedPurchaseOrderDrafts({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        jobId: null,
        lines: [
          { partId: ALPHA_PART_ID, quantity: 4 },
          { partId: BETA_PART_ID, quantity: 2 },
          { partId: ALPHA_LINEAR_PART_ID, quantity: 3 },
        ],
      },
    });

    expect(result.purchaseOrders).toEqual([
      { code: 'PO-00001', id: expect.any(String), supplierName: 'Acme Supplies' },
      { code: 'PO-00002', id: expect.any(String), supplierName: 'Zeta Steel' },
    ]);
  });

  test('prefills quantities and leaves the price for a cost reader to key', async ({ context }) => {
    const { purchaseOrders: created } = await seedPurchaseOrderDrafts({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { jobId: null, lines: [{ partId: ALPHA_PART_ID, quantity: 7 }] },
    });
    const [draft] = created;
    if (!draft) throw new Error('Expected a seeded draft');

    const stored = await context.db.query.purchaseOrders.findFirst({
      where: (row, { eq }) => eq(row.id, draft.id),
      with: { lines: true },
    });

    expect(stored).toMatchObject({ status: 'draft' });
    expect(stored?.lines).toEqual([expect.objectContaining({ quantity: 7, unitPrice: 0 })]);
  });

  test('links every draft back to the Job the selection was seeded from', async ({ context }) => {
    const result = await seedPurchaseOrderDrafts({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        jobId: context.jobId,
        lines: [
          { partId: ALPHA_PART_ID, quantity: 1 },
          { partId: BETA_PART_ID, quantity: 1 },
        ],
      },
    });

    const stored = await context.db.query.purchaseOrders.findMany({ with: { jobLinks: true } });

    expect(result.purchaseOrders).toHaveLength(2);
    expect(stored.map((row) => row.jobLinks.map((link) => link.jobId))).toEqual([[context.jobId], [context.jobId]]);
  });

  test('refuses a Built Part and creates nothing at all', async ({ context }) => {
    await expect(
      seedPurchaseOrderDrafts({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          jobId: null,
          lines: [
            { partId: ALPHA_PART_ID, quantity: 1 },
            { partId: BUILT_PART_ID, quantity: 1 },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.part_not_purchasable' });

    await expect(context.db.select().from(purchaseOrders)).resolves.toEqual([]);
  });

  test('refuses a fractional quantity on a Part counted in whole pieces', async ({ context }) => {
    await expect(
      seedPurchaseOrderDrafts({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { jobId: null, lines: [{ partId: ALPHA_PART_ID, quantity: 1.5 }] },
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.invalid_quantity' });
  });

  test('refuses a Part that does not exist', async ({ context }) => {
    await expect(
      seedPurchaseOrderDrafts({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { jobId: null, lines: [{ partId: '00000000-0000-4000-8000-0000000009ff', quantity: 1 }] },
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.part_not_found' });
  });
});

function partRow(overrides: Partial<typeof parts.$inferInsert>): typeof parts.$inferInsert {
  return {
    category: 'Pipe',
    code: 'S-100',
    description: 'Seed Part',
    finish: 'Plain',
    id: ALPHA_PART_ID,
    name: 'Seed Part',
    standardPurchaseLengthMm: null,
    supplierCode: 'SUP-SEED',
    supplierId: SUPPLIER_A_ID,
    unitOfMeasure: 'piece',
    ...overrides,
  };
}

async function seedJob(db: Db): Promise<string> {
  const [customer] = await db.insert(customers).values({ companyName: 'Seed Customer' }).returning();
  if (!customer) throw new Error('Customer insert did not return a row');

  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      kind: 'custom',
      quotedBasePrice: 0,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: ACTOR_ID,
      status: 'accepted',
      workTitle: 'Seeded work',
    })
    .returning();
  if (!quote) throw new Error('Quote insert did not return a row');

  const [job] = await db.insert(jobs).values({ quoteId: quote.id }).returning();
  if (!job) throw new Error('Job insert did not return a row');

  return job.id;
}
