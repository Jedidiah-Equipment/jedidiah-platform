import { auditEvents, customers, type Db, documents, jobs, parts, quotes, supplier, user } from '@pkg/db';
import { DateOnlyIso, type PurchaseOrderPdfModel } from '@pkg/schema';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, vi } from 'vitest';

import { postReceipt } from '../inventory/stock-movement-service.js';
import { getJobDocuments } from '../jobs/job-read-service.js';
import { updatePart } from '../parts/part-service.js';
import { removeSupplier } from '../suppliers/supplier-service.js';
import { createTester } from '../test/create-tester.js';
import { InMemoryStorageAdapter } from '../test/in-memory-storage-adapter.js';
import {
  cancelPurchaseOrder,
  closePurchaseOrderShort,
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  markPurchaseOrderSent,
  savePurchaseOrderDraft,
} from './purchase-order-service.js';

const ACTOR_ID = 'po-test-user';
const SUPPLIER_A_ID = '00000000-0000-4000-8000-000000000101';
const SUPPLIER_B_ID = '00000000-0000-4000-8000-000000000102';
const PIECE_PART_ID = '00000000-0000-4000-8000-000000000201';
const LINEAR_PART_ID = '00000000-0000-4000-8000-000000000202';
const OTHER_PART_ID = '00000000-0000-4000-8000-000000000203';

function draftInput(id: string, lines: Array<{ partId: string; quantity: number; unitPrice: number }>) {
  return { expectedDeliveryDate: null, id, jobIds: [], lines, supplierId: SUPPLIER_A_ID };
}

const test = createTester(async ({ db }) => {
  await seedCatalog(db);
  const jobIds = await seedJobs(db);

  return { db, jobIds, storage: new InMemoryStorageAdapter() };
});

describe('Purchase Order draft lifecycle', () => {
  test('creates a draft, replaces its lines and Job links, and audits header changes', async ({ context }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });

    expect(purchaseOrder).toMatchObject({ code: 'PO-00001', jobs: [], lines: [], status: 'draft' });
    await expect(
      listPurchaseOrders({
        db: context.db,
        input: { cursor: 0, limit: 20, search: 'acme', sortBy: 'createdAt', sortDirection: 'desc' },
      }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ id: purchaseOrder.id })], total: 1 });
    await expect(removeSupplier({ actorUserId: ACTOR_ID, db: context.db, id: SUPPLIER_A_ID })).rejects.toMatchObject({
      code: 'supplier.has_draft_purchase_orders',
    });

    const updated = await savePurchaseOrderDraft({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        expectedDeliveryDate: DateOnlyIso.parse('2026-08-20'),
        id: purchaseOrder.id,
        jobIds: context.jobIds,
        lines: [
          { partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 },
          { partId: LINEAR_PART_ID, quantity: 2, unitPrice: 900 },
        ],
        supplierId: SUPPLIER_A_ID,
      },
    });

    expect(updated).toMatchObject({
      expectedDeliveryDate: '2026-08-20',
      jobs: [{ id: context.jobIds[0] }, { id: context.jobIds[1] }],
      lines: [
        { partId: PIECE_PART_ID, quantity: 4, standardPurchaseLengthMm: null, unitPrice: 125.5 },
        { partId: LINEAR_PART_ID, quantity: 2, standardPurchaseLengthMm: 6_000, unitPrice: 900 },
      ],
    });

    // One save is one audit event: the header change and both child collections together.
    const events = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);
    expect(events).toEqual([
      expect.objectContaining({ action: 'created', entityId: purchaseOrder.id, entityType: 'purchase_order' }),
      expect.objectContaining({
        action: 'updated',
        changes: expect.objectContaining({
          expectedDeliveryDate: { from: null, to: '2026-08-20' },
          [`job:${updated.jobs[0]?.code}`]: expect.objectContaining({ from: null }),
          'line:P-100': expect.objectContaining({ from: null }),
        }),
        entityId: purchaseOrder.id,
        entityType: 'purchase_order',
      }),
    ]);
  });

  test('rejects a line from another supplier and a fractional piece count', async ({ context }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });

    await expect(
      savePurchaseOrderDraft({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: draftInput(purchaseOrder.id, [{ partId: OTHER_PART_ID, quantity: 1, unitPrice: 10 }]),
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.part_supplier_mismatch' });
    await expect(
      savePurchaseOrderDraft({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 1.5, unitPrice: 10 }]),
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.invalid_quantity' });
  });

  test('prevents a Part supplier change from breaking an existing Purchase Order', async ({ context }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });
    await savePurchaseOrderDraft({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 1, unitPrice: 10 }]),
    });

    await expect(
      updatePart({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          category: 'Pipe',
          code: 'P-100',
          description: 'Test Part',
          drawingCode: null,
          finish: 'Plain',
          id: PIECE_PART_ID,
          isInternallyFabricated: false,
          minimumStock: null,
          name: 'Test Part',
          standardPurchaseLengthMm: null,
          stockTrackingMode: 'perpetual',
          storageLocation: null,
          supplierCode: 'SUP-100',
          supplierId: SUPPLIER_B_ID,
          unitOfMeasure: 'piece',
        },
      }),
    ).rejects.toMatchObject({ code: 'part.supplier_locked_by_purchase_order' });

    await cancelPurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id });
    await expect(
      updatePart({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          category: 'Pipe',
          code: 'P-100',
          description: 'Test Part',
          drawingCode: null,
          finish: 'Plain',
          id: PIECE_PART_ID,
          isInternallyFabricated: false,
          minimumStock: null,
          name: 'Test Part',
          standardPurchaseLengthMm: null,
          stockTrackingMode: 'perpetual',
          storageLocation: null,
          supplierCode: 'SUP-100',
          supplierId: SUPPLIER_B_ID,
          unitOfMeasure: 'piece',
        },
      }),
    ).resolves.toMatchObject({ supplierId: SUPPLIER_B_ID });
  });
});

describe('Purchase Order send and cancel', () => {
  test('stores one as-sent PDF and projects it onto every linked Job', async ({ context }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: DateOnlyIso.parse('2026-08-20'), supplierId: SUPPLIER_A_ID },
    });
    await savePurchaseOrderDraft({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        ...draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 }]),
        expectedDeliveryDate: DateOnlyIso.parse('2026-08-20'),
        jobIds: context.jobIds,
      },
    });
    const render = vi.fn(async (_input: { document: PurchaseOrderPdfModel; filename: string }) => pdfBytes());

    const sent = await markPurchaseOrderSent({
      actorUserId: ACTOR_ID,
      db: context.db,
      id: purchaseOrder.id,
      pdfRenderer: render,
      storage: context.storage,
    });

    expect(sent).toMatchObject({ documentId: expect.any(String), sentAt: expect.any(String), status: 'sent' });
    expect(render).toHaveBeenCalledWith({
      document: expect.objectContaining({
        code: 'PO-00001',
        expectedDeliveryDate: '2026-08-20',
        jobCodes: expect.arrayContaining([expect.stringMatching(/^JOB-/), expect.stringMatching(/^JOB-/)]),
        lines: [expect.objectContaining({ partCode: 'P-100', quantity: 4, unitPrice: 125.5 })],
        supplier: expect.objectContaining({ companyName: 'Acme Supplies' }),
      }),
      filename: 'PO-00001.pdf',
    });

    for (const jobId of context.jobIds) {
      await expect(getJobDocuments({ db: context.db, jobId })).resolves.toEqual([
        expect.objectContaining({ id: sent.documentId, ownerType: 'purchase_order', purchaseOrderId: sent.id }),
      ]);
    }
    await expect(context.db.select().from(documents)).resolves.toHaveLength(1);

    await expect(
      savePurchaseOrderDraft({ actorUserId: ACTOR_ID, db: context.db, input: draftInput(sent.id, []) }),
    ).rejects.toMatchObject({ code: 'purchase_order.not_draft' });
  });

  test('refuses to send an empty draft and allows a zero-receipt cancellation', async ({ context }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });

    await expect(
      markPurchaseOrderSent({
        actorUserId: ACTOR_ID,
        db: context.db,
        id: purchaseOrder.id,
        pdfRenderer: async () => pdfBytes(),
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.empty' });

    await expect(
      cancelPurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id }),
    ).resolves.toMatchObject({ sentAt: null, status: 'cancelled' });
  });

  test('removes the uploaded PDF when the outer send transaction rolls back', async ({ context }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });
    await savePurchaseOrderDraft({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 1, unitPrice: 10 }]),
    });
    await context.db.execute(sql`
      create function fail_purchase_order_send() returns trigger language plpgsql as $$
      begin
        if new.status = 'sent' then raise exception 'forced send failure'; end if;
        return new;
      end
      $$
    `);
    await context.db.execute(sql`
      create trigger fail_purchase_order_send
      before update on purchase_order
      for each row execute function fail_purchase_order_send()
    `);

    await expect(
      markPurchaseOrderSent({
        actorUserId: ACTOR_ID,
        db: context.db,
        id: purchaseOrder.id,
        pdfRenderer: async () => pdfBytes(),
        storage: context.storage,
      }),
    ).rejects.toThrow();
    expect(context.storage.objects.size).toBe(0);
    await expect(context.db.select().from(documents)).resolves.toHaveLength(0);
    await expect(getPurchaseOrder({ db: context.db, id: purchaseOrder.id })).resolves.toMatchObject({
      status: 'draft',
    });
  });
});

describe('Purchase Order receiving progress', () => {
  test('projects the stored status through cumulative receipts on every line', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [
      { partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 },
      { partId: LINEAR_PART_ID, quantity: 2, unitPrice: 900 },
    ]);

    expect(purchaseOrder).toMatchObject({
      closedShortAt: null,
      derivedStatus: 'sent',
      lines: [{ receivedQuantity: 0 }, { receivedQuantity: 0 }],
    });

    await receive(context, purchaseOrder.id, PIECE_PART_ID, 3);
    await expect(getPurchaseOrder({ db: context.db, id: purchaseOrder.id })).resolves.toMatchObject({
      derivedStatus: 'partially-received',
      lines: [{ partId: PIECE_PART_ID, receivedQuantity: 3 }, { receivedQuantity: 0 }],
    });

    await receive(context, purchaseOrder.id, PIECE_PART_ID, 1);
    await receive(context, purchaseOrder.id, LINEAR_PART_ID, 2);
    await expect(getPurchaseOrder({ db: context.db, id: purchaseOrder.id })).resolves.toMatchObject({
      derivedStatus: 'received',
      lines: [{ receivedQuantity: 4 }, { receivedQuantity: 2 }],
    });

    // The list read projects the same derived state, so a receiver never sees two different answers.
    await expect(
      listPurchaseOrders({
        db: context.db,
        input: { cursor: 0, limit: 20, search: '', sortBy: 'createdAt', sortDirection: 'desc' },
      }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ derivedStatus: 'received' })] });
  });

  test('closes a part-delivered order short and stops cancelling it once stock has arrived', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 }]);

    await expect(
      closePurchaseOrderShort({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id }),
    ).rejects.toMatchObject({ code: 'purchase_order.no_receipts' });

    await receive(context, purchaseOrder.id, PIECE_PART_ID, 1);

    // The cancel guard is no longer trivially satisfied: a real receipt now blocks it.
    await expect(
      cancelPurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id }),
    ).rejects.toMatchObject({ code: 'purchase_order.has_receipts' });

    const closed = await closePurchaseOrderShort({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id });

    expect(closed).toMatchObject({ closedShortAt: expect.any(String), derivedStatus: 'closed-short', status: 'sent' });
    await expect(
      closePurchaseOrderShort({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id }),
    ).rejects.toMatchObject({ code: 'purchase_order.already_closed_short' });
    // The released remainder stays released: a later delivery cannot make the assertion a lie.
    await expect(receive(context, purchaseOrder.id, PIECE_PART_ID, 1)).rejects.toMatchObject({
      code: 'purchase_order.closed_short',
    });
    await expect(
      context.db.select().from(auditEvents).where(eq(auditEvents.entityId, purchaseOrder.id)),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'updated',
          changes: expect.objectContaining({ closedShortAt: { from: null, to: closed.closedShortAt } }),
        }),
      ]),
    );
  });

  test('refuses to close a draft or a cancelled order short', async ({ context }) => {
    const draft = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });

    await expect(
      closePurchaseOrderShort({ actorUserId: ACTOR_ID, db: context.db, id: draft.id }),
    ).rejects.toMatchObject({ code: 'purchase_order.not_sent' });

    await cancelPurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: draft.id });
    await expect(
      closePurchaseOrderShort({ actorUserId: ACTOR_ID, db: context.db, id: draft.id }),
    ).rejects.toMatchObject({ code: 'purchase_order.not_sent' });
  });

  test('refuses to close a fully received order short — there is no remainder to release', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 4);

    await expect(
      closePurchaseOrderShort({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id }),
    ).rejects.toMatchObject({ code: 'purchase_order.fully_received' });
  });
});

async function sendOrder(
  context: { db: Db; storage: InMemoryStorageAdapter },
  lines: Array<{ partId: string; quantity: number; unitPrice: number }>,
) {
  const purchaseOrder = await createPurchaseOrder({
    actorUserId: ACTOR_ID,
    db: context.db,
    input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
  });
  await savePurchaseOrderDraft({
    actorUserId: ACTOR_ID,
    db: context.db,
    input: draftInput(purchaseOrder.id, lines),
  });

  return markPurchaseOrderSent({
    actorUserId: ACTOR_ID,
    db: context.db,
    id: purchaseOrder.id,
    pdfRenderer: async () => pdfBytes(),
    storage: context.storage,
  });
}

async function receive(context: { db: Db }, purchaseOrderId: string, partId: string, quantity: number) {
  return postReceipt({
    actorUserId: ACTOR_ID,
    db: context.db,
    input: { lengthMm: null, partId, purchaseOrderId, quantity, unitCost: null },
  });
}

async function seedCatalog(db: Db): Promise<void> {
  await db.insert(user).values({
    createdAt: new Date(),
    email: 'po-test@example.com',
    emailVerified: true,
    id: ACTOR_ID,
    name: 'PO Test User',
    role: 'admin',
    updatedAt: new Date(),
  });
  await db.insert(supplier).values([
    { companyName: 'Acme Supplies', id: SUPPLIER_A_ID },
    { companyName: 'Other Supplies', id: SUPPLIER_B_ID },
  ]);
  await db.insert(parts).values([
    partRow({ code: 'P-100', id: PIECE_PART_ID, supplierId: SUPPLIER_A_ID }),
    partRow({
      code: 'P-200',
      id: LINEAR_PART_ID,
      standardPurchaseLengthMm: 6_000,
      supplierId: SUPPLIER_A_ID,
      unitOfMeasure: 'mm',
    }),
    partRow({ code: 'P-300', id: OTHER_PART_ID, supplierId: SUPPLIER_B_ID }),
  ]);
}

function partRow(overrides: Partial<typeof parts.$inferInsert>): typeof parts.$inferInsert {
  return {
    category: 'Pipe',
    code: 'P-100',
    description: 'Test Part',
    finish: 'Plain',
    id: PIECE_PART_ID,
    name: 'Test Part',
    standardPurchaseLengthMm: null,
    supplierCode: 'SUP-100',
    supplierId: SUPPLIER_A_ID,
    unitOfMeasure: 'piece',
    ...overrides,
  };
}

async function seedJobs(db: Db): Promise<[string, string]> {
  const [customer] = await db
    .insert(customers)
    .values({ companyName: 'PO Job Customer', email: 'jobs@example.com', phone: '0123456789', vatNumber: 'VAT-PO' })
    .returning({ id: customers.id });
  if (!customer) throw new Error('Customer insert did not return a row');

  const jobIds: string[] = [];
  for (const workTitle of ['Pump rebuild', 'Trailer repair']) {
    const [quote] = await db
      .insert(quotes)
      .values({
        customerId: customer.id,
        kind: 'custom',
        productId: null,
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_ID,
        status: 'draft',
        workTitle,
      })
      .returning({ id: quotes.id });
    if (!quote) throw new Error('Quote insert did not return a row');
    const [job] = await db.insert(jobs).values({ quoteId: quote.id }).returning({ id: jobs.id });
    if (!job) throw new Error('Job insert did not return a row');
    jobIds.push(job.id);
  }

  const [first, second] = jobIds;
  if (!first || !second) throw new Error('Job fixtures were not created');
  return [first, second];
}

function pdfBytes(): Uint8Array {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
}
