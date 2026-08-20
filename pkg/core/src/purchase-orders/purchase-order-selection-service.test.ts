import { customers, type Db, jobs, parts, purchaseOrders, quotes, supplier, user } from '@pkg/db';
import { describe, expect } from 'vitest';
import { postAdjustment } from '../inventory/stock-movement-service.js';
import { createTester } from '../test/create-tester.js';
import { InMemoryStorageAdapter } from '../test/in-memory-storage-adapter.js';
import { partValues } from '../test/part-fixtures.js';
import { createPurchaseOrderDraftsFromSelection } from './purchase-order-selection-service.js';
import {
  approvePurchaseOrder,
  getPurchaseOrder,
  markPurchaseOrderSent,
  revertPurchaseOrderToDraft,
  savePurchaseOrderDraft,
} from './purchase-order-service.js';

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
    { ...partValues({ code: 'S-100', supplierId: SUPPLIER_A_ID, unitOfMeasure: 'piece' }), id: ALPHA_PART_ID },
    {
      ...partValues({
        code: 'S-200',
        standardPurchaseLengthMm: 6_000,
        supplierId: SUPPLIER_A_ID,
        unitOfMeasure: 'mm',
      }),
      id: ALPHA_LINEAR_PART_ID,
    },
    { ...partValues({ code: 'S-300', supplierId: SUPPLIER_B_ID, unitOfMeasure: 'piece' }), id: BETA_PART_ID },
    {
      ...partValues({
        code: 'S-400',
        isInternallyFabricated: true,
        supplierId: SUPPLIER_A_ID,
        unitOfMeasure: 'piece',
      }),
      id: BUILT_PART_ID,
    },
  ]);

  return { jobId: await seedJob(db) };
});

describe('createPurchaseOrderDraftsFromSelection', () => {
  test('splits one selection into a draft per Supplier, ordered by Supplier name', async ({ context }) => {
    const result = await createPurchaseOrderDraftsFromSelection({
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

  test('leaves a never-costed Part unpriced for a cost reader to key', async ({ context }) => {
    const { purchaseOrders: created } = await createPurchaseOrderDraftsFromSelection({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { jobId: null, lines: [{ partId: ALPHA_PART_ID, quantity: 7 }] },
    });
    const [draft] = created;
    if (!draft) throw new Error('Expected a seeded draft');

    await expect(getPurchaseOrder({ db: context.db, id: draft.id })).resolves.toMatchObject({
      lines: [{ quantity: 7, unitPrice: 0 }],
      status: 'draft',
    });
  });

  test('prefills a draft line from the Part current moving average', async ({ context }) => {
    await postAdjustment({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        delta: 10,
        lengthMm: null,
        note: null,
        partId: ALPHA_PART_ID,
        reason: 'opening-balance',
        unitCost: 0.3,
      },
    });

    const { purchaseOrders: created } = await createPurchaseOrderDraftsFromSelection({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { jobId: null, lines: [{ partId: ALPHA_PART_ID, quantity: 7 }] },
    });
    const [draft] = created;
    if (!draft) throw new Error('Expected a seeded draft');

    await expect(getPurchaseOrder({ db: context.db, id: draft.id })).resolves.toMatchObject({
      lines: [{ quantity: 7, unitPrice: 0.3 }],
    });
  });

  test('prefills a linear Part at the cost of one standard purchase length', async ({ context }) => {
    await postAdjustment({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        delta: 2,
        lengthMm: 6_000,
        note: null,
        partId: ALPHA_LINEAR_PART_ID,
        reason: 'opening-balance',
        unitCost: 228.75,
      },
    });

    const { purchaseOrders: created } = await createPurchaseOrderDraftsFromSelection({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { jobId: null, lines: [{ partId: ALPHA_LINEAR_PART_ID, quantity: 3 }] },
    });
    const [draft] = created;
    if (!draft) throw new Error('Expected a seeded draft');

    await expect(getPurchaseOrder({ db: context.db, id: draft.id })).resolves.toMatchObject({
      lines: [{ quantity: 3, unitPrice: 228.75 }],
    });
  });

  test('links every draft back to the Job the selection was seeded from', async ({ context }) => {
    const result = await createPurchaseOrderDraftsFromSelection({
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
      createPurchaseOrderDraftsFromSelection({
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
      createPurchaseOrderDraftsFromSelection({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { jobId: null, lines: [{ partId: ALPHA_PART_ID, quantity: 1.5 }] },
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.invalid_quantity' });
  });

  test('refuses a Part that does not exist', async ({ context }) => {
    await expect(
      createPurchaseOrderDraftsFromSelection({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { jobId: null, lines: [{ partId: '00000000-0000-4000-8000-0000000009ff', quantity: 1 }] },
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.part_not_found' });
  });
});

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

describe('sending a Purchase Order raised from a selection', () => {
  test('refuses to send while a line is still unpriced', async ({ context }) => {
    const { purchaseOrders: created } = await createPurchaseOrderDraftsFromSelection({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { jobId: null, lines: [{ partId: ALPHA_PART_ID, quantity: 2 }] },
    });
    const [draft] = created;
    if (!draft) throw new Error('Expected a seeded draft');

    await approvePurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: draft.id });

    // A receipt against a zero-priced line would stamp that zero onto the ledger as the Part's cost.
    // Approval judges the order, so the price is still caught by the write that reads the lines.
    await expect(
      markPurchaseOrderSent({
        actorUserId: ACTOR_ID,
        db: context.db,
        id: draft.id,
        pdfRenderer: async () => pdfBytes(),
        storage: new InMemoryStorageAdapter(),
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.line_not_priced' });

    // Approval locked the order, so fixing the price goes back through the audited revert.
    await revertPurchaseOrderToDraft({ actorUserId: ACTOR_ID, db: context.db, id: draft.id });
    await savePurchaseOrderDraft({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        expectedDeliveryDate: null,
        id: draft.id,
        jobIds: [],
        lines: [{ partId: ALPHA_PART_ID, quantity: 2, unitPrice: 125 }],
        supplierId: SUPPLIER_A_ID,
      },
    });
    await approvePurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: draft.id });

    await expect(
      markPurchaseOrderSent({
        actorUserId: ACTOR_ID,
        db: context.db,
        id: draft.id,
        pdfRenderer: async () => pdfBytes(),
        storage: new InMemoryStorageAdapter(),
      }),
    ).resolves.toMatchObject({ status: 'sent' });
  });
});

/** The PDF magic bytes the document policy checks; the renderer itself is not under test here. */
function pdfBytes(): Uint8Array {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
}
