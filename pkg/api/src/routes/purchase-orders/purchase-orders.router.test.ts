import type { Db } from '@pkg/db';
import { customers, documents, invoiceExtractions, jobs, parts, quotes, supplier, user } from '@pkg/db';
import { describe, expect } from 'vitest';

import { type AppRouterCaller, createTester } from '../../test/create-tester.js';
import { mockSession } from '../../test/test-utils.js';

const SUPPLIER_ID = '00000000-0000-4000-8000-000000000301';
const PART_ID = '00000000-0000-4000-8000-000000000302';
const SPARE_PART_ID = '00000000-0000-4000-8000-000000000303';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    createdAt: new Date(),
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role: 'admin',
    updatedAt: new Date(),
  });
  await db.insert(supplier).values({ companyName: 'Router Supplies', id: SUPPLIER_ID });
  await db.insert(parts).values([
    {
      category: 'Pipe',
      code: 'PO-ROUTER-PART',
      description: 'Router test Part',
      finish: 'Plain',
      id: PART_ID,
      name: 'Router Part',
      supplierCode: 'ROUTER-1',
      supplierId: SUPPLIER_ID,
      unitOfMeasure: 'piece',
    },
    {
      category: 'Pipe',
      code: 'PO-ROUTER-SPARE',
      description: 'Router spare Part',
      finish: 'Plain',
      id: SPARE_PART_ID,
      name: 'Router Spare',
      supplierCode: 'ROUTER-2',
      supplierId: SUPPLIER_ID,
      unitOfMeasure: 'piece',
    },
  ]);
  const [customer] = await db
    .insert(customers)
    .values({ companyName: 'Router Customer', email: 'customer@example.com', phone: '0123456789', vatNumber: 'VAT-1' })
    .returning({ id: customers.id });
  if (!customer) throw new Error('Customer fixture was not created');
  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      kind: 'custom',
      productId: null,
      quotedBasePrice: 0,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'test-user-id',
      status: 'draft',
      workTitle: 'Router repair',
    })
    .returning({ id: quotes.id });
  if (!quote) throw new Error('Quote fixture was not created');
  const [job] = await db.insert(jobs).values({ quoteId: quote.id }).returning({ id: jobs.id });
  if (!job) throw new Error('Job fixture was not created');

  return { db, jobId: job.id };
});

describe('purchaseOrders router', () => {
  test('enforces lifecycle permissions and applies the cost gate to line prices', async ({ context }) => {
    const admin = context.createCaller();
    const stores = context.createCaller(mockSession('stores'));
    const sales = context.createCaller(mockSession('sales'));
    const created = await admin.purchaseOrders.create({ supplierId: SUPPLIER_ID });
    await admin.purchaseOrders.saveDraft({
      expectedDeliveryDate: null,
      id: created.id,
      jobIds: [],
      lines: [{ partId: PART_ID, quantity: 2, unitPrice: 150 }],
      supplierId: SUPPLIER_ID,
    });

    await expect(admin.purchaseOrders.get({ id: created.id })).resolves.toMatchObject({
      lines: [{ unitPrice: 150 }],
    });
    await expect(stores.purchaseOrders.get({ id: created.id })).resolves.toMatchObject({
      lines: [{ unitPrice: null }],
    });
    await expect(stores.purchaseOrders.create({ supplierId: SUPPLIER_ID })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(sales.purchaseOrders.get({ id: created.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // The gate covers the list read too, not just the single order.
    await expect(stores.purchaseOrders.list({ cursor: 0, limit: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ lines: [expect.objectContaining({ unitPrice: null })] })],
    });
  });

  test('sends a populated draft and cancels a zero-receipt draft through their named permissions', async ({
    context,
  }) => {
    const admin = context.createCaller();
    const sendable = await admin.purchaseOrders.create({ supplierId: SUPPLIER_ID });
    await admin.purchaseOrders.saveDraft({
      expectedDeliveryDate: null,
      id: sendable.id,
      jobIds: [context.jobId],
      lines: [{ partId: PART_ID, quantity: 2, unitPrice: 150 }],
      supplierId: SUPPLIER_ID,
    });

    await expect(admin.purchaseOrders.markSent({ id: sendable.id })).resolves.toMatchObject({ status: 'sent' });
    await expect(admin.jobs.get({ id: context.jobId })).resolves.toMatchObject({
      documents: [expect.objectContaining({ ownerType: 'purchase_order' })],
    });
    await expect(
      context.createCaller(mockSession('job-viewer')).jobs.get({ id: context.jobId }),
    ).resolves.toMatchObject({
      documents: [],
    });

    const cancellable = await admin.purchaseOrders.create({ supplierId: SUPPLIER_ID });
    await expect(admin.purchaseOrders.cancel({ id: cancellable.id })).resolves.toMatchObject({ status: 'cancelled' });
  });

  test('lets a price-blind stores user receive while the line price still lands on the movement', async ({
    context,
  }) => {
    const admin = context.createCaller();
    const stores = context.createCaller(mockSession('stores'));
    const purchaseOrder = await sendOrder(admin, 4);

    const received = await stores.purchaseOrders.receive({
      lengthMm: null,
      partId: PART_ID,
      purchaseOrderId: purchaseOrder.id,
      quantity: 3,
      unitCost: null,
    });

    // The receiver never sees the price it just posted, and cannot send one of their own.
    expect(received).toMatchObject({ movement: { delta: 3, movementType: 'receipt', unitCost: null }, warnings: [] });
    await expect(
      stores.purchaseOrders.receive({
        lengthMm: null,
        partId: PART_ID,
        purchaseOrderId: purchaseOrder.id,
        quantity: 1,
        unitCost: 175,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(admin.purchaseOrders.get({ id: purchaseOrder.id })).resolves.toMatchObject({
      derivedStatus: 'partially-received',
      lines: [{ receivedQuantity: 3 }],
    });
    await expect(admin.inventory.history({ partId: PART_ID })).resolves.toMatchObject({
      items: [{ movementType: 'receipt', purchaseOrderId: purchaseOrder.id, unitCost: 150 }],
    });
  });

  test('warns on an over-receipt, which leaves the order received with nothing to close short', async ({ context }) => {
    const admin = context.createCaller();
    const overDelivered = await sendOrder(admin, 4);

    await expect(
      context.createCaller(mockSession('stores')).purchaseOrders.receive({
        lengthMm: null,
        partId: PART_ID,
        purchaseOrderId: overDelivered.id,
        quantity: 5,
        unitCost: null,
      }),
    ).resolves.toMatchObject({ warnings: ['exceeds-ordered'] });
    await expect(admin.purchaseOrders.get({ id: overDelivered.id })).resolves.toMatchObject({
      derivedStatus: 'received',
    });
    await expect(admin.purchaseOrders.closeShort({ id: overDelivered.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  test('closes a part-delivered order short under the close permission, and blocks cancelling it', async ({
    context,
  }) => {
    const admin = context.createCaller();
    const stores = context.createCaller(mockSession('stores'));
    const purchaseOrder = await sendOrder(admin, 4);

    await stores.purchaseOrders.receive({
      lengthMm: null,
      partId: PART_ID,
      purchaseOrderId: purchaseOrder.id,
      quantity: 1,
      unitCost: null,
    });

    // Stores receives, procurement closes: close-short is a purchasing decision, not a dock one.
    await expect(stores.purchaseOrders.closeShort({ id: purchaseOrder.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(admin.purchaseOrders.closeShort({ id: purchaseOrder.id })).resolves.toMatchObject({
      derivedStatus: 'closed-short',
      status: 'sent',
    });
    await expect(admin.purchaseOrders.cancel({ id: purchaseOrder.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('buy-list seeding and late orders', () => {
  test('seeds drafts under purchase_order:create and lists late orders under purchase_order:read', async ({
    context,
  }) => {
    const admin = context.createCaller();
    const stores = context.createCaller(mockSession('stores'));

    // Stores may receive against an order but never raise one.
    await expect(
      stores.purchaseOrders.createFromSelection({ jobId: null, lines: [{ partId: PART_ID, quantity: 3 }] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(context.createCaller(mockSession('sales')).purchaseOrders.late()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    await expect(
      admin.purchaseOrders.createFromSelection({ jobId: context.jobId, lines: [{ partId: PART_ID, quantity: 3 }] }),
    ).resolves.toMatchObject({ purchaseOrders: [{ supplierName: 'Router Supplies' }] });

    // Seeded drafts are unpriced, so the cost gate has nothing to hide from a price-blind reader.
    await expect(stores.purchaseOrders.list({})).resolves.toMatchObject({
      items: [{ jobs: [{ id: context.jobId }], lines: [{ quantity: 3, unitPrice: null }] }],
    });
    await expect(stores.purchaseOrders.late()).resolves.toEqual({ items: [] });
  });
});

describe('amendments, returns, and credit notes', () => {
  test('amends a sent order under purchase_order:amend and refuses a dock user', async ({ context }) => {
    const admin = context.createCaller();
    const procurement = context.createCaller(mockSession('procurement-manager'));
    const stores = context.createCaller(mockSession('stores'));
    const purchaseOrder = await sendOrder(admin, 4);

    await expect(
      stores.purchaseOrders.amendQuantity({
        id: purchaseOrder.id,
        note: 'Stores does not change orders',
        partId: PART_ID,
        quantity: 6,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      admin.purchaseOrders.amendQuantity({
        id: purchaseOrder.id,
        note: 'Supplier can send 6',
        partId: PART_ID,
        quantity: 6,
      }),
    ).resolves.toMatchObject({ lines: [{ partId: PART_ID, quantity: 6 }] });
    await expect(
      admin.purchaseOrders.amendAddLine({
        id: purchaseOrder.id,
        note: 'Phoned through',
        partId: SPARE_PART_ID,
        quantity: 1,
        unitPrice: 20,
      }),
    ).resolves.toMatchObject({ lines: [{ partId: PART_ID }, { partId: SPARE_PART_ID }] });
    await expect(
      procurement.purchaseOrders.amendExpectedDate({
        expectedDeliveryDate: '2026-08-04',
        id: purchaseOrder.id,
        note: 'Supplier promised Tuesday',
      }),
    ).resolves.toMatchObject({ expectedDeliveryDate: '2026-08-04' });

    // The log is priceless in the literal sense, so a price-blind reader sees the whole history.
    await expect(stores.purchaseOrders.amendments({ purchaseOrderId: purchaseOrder.id })).resolves.toMatchObject({
      items: [
        { kind: 'quantity-change', newQuantity: 6, oldQuantity: 4 },
        { kind: 'add-line', newQuantity: 1 },
        { kind: 'expected-date-change', newExpectedDate: '2026-08-04', oldExpectedDate: null },
      ],
    });
    await expect(stores.purchaseOrders.documents({ purchaseOrderId: purchaseOrder.id })).resolves.toMatchObject({
      items: [{ revision: 4 }, { revision: 3 }, { revision: 2 }, { revision: 1 }],
    });
  });

  test('lets stores and procurement return stock, refuses sales, and applies the cost gate', async ({ context }) => {
    const admin = context.createCaller();
    const stores = context.createCaller(mockSession('stores'));
    const procurement = context.createCaller(mockSession('procurement-manager'));
    const sales = context.createCaller(mockSession('sales'));
    const purchaseOrder = await sendOrder(admin, 4);
    await stores.purchaseOrders.receive({
      lengthMm: null,
      partId: PART_ID,
      purchaseOrderId: purchaseOrder.id,
      quantity: 4,
      unitCost: null,
    });

    const returned = await stores.purchaseOrders.returnToSupplier({
      lengthMm: null,
      note: 'Wrong thread',
      partId: PART_ID,
      purchaseOrderId: purchaseOrder.id,
      quantity: 2,
      reason: 'wrong-item',
    });

    expect(returned).toMatchObject({
      movement: { delta: -2, movementType: 'return-to-supplier', reason: 'wrong-item', unitCost: null },
      warnings: [],
    });
    await expect(
      procurement.purchaseOrders.returnToSupplier({
        lengthMm: null,
        note: 'Defective on inspection',
        partId: PART_ID,
        purchaseOrderId: purchaseOrder.id,
        quantity: 1,
        reason: 'defective',
      }),
    ).resolves.toMatchObject({
      movement: { delta: -1, movementType: 'return-to-supplier', reason: 'defective', unitCost: 150 },
    });
    await expect(
      sales.purchaseOrders.returnToSupplier({
        lengthMm: null,
        note: 'Sales cannot move stock',
        partId: PART_ID,
        purchaseOrderId: purchaseOrder.id,
        quantity: 1,
        reason: 'order-error',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(admin.purchaseOrders.returns({ purchaseOrderId: purchaseOrder.id })).resolves.toMatchObject({
      items: [
        { quantity: 2, settledByDocumentId: null, value: 300 },
        { quantity: 1, settledByDocumentId: null, value: 150 },
      ],
    });
    await expect(stores.purchaseOrders.returns({ purchaseOrderId: purchaseOrder.id })).resolves.toMatchObject({
      items: [
        { quantity: 2, value: null },
        { quantity: 1, value: null },
      ],
    });
    await expect(admin.purchaseOrders.returnsAwaitingCredit()).resolves.toMatchObject({
      items: [
        { purchaseOrderId: purchaseOrder.id, quantity: 2, value: 300 },
        { purchaseOrderId: purchaseOrder.id, quantity: 1, value: 150 },
      ],
    });
  });

  test('gates the invoice cross-check on cost access, and its apply on the right to revalue', async ({ context }) => {
    const admin = context.createCaller();
    const stores = context.createCaller(mockSession('stores'));
    const procurement = context.createCaller(mockSession('procurement-manager'));
    const purchaseOrder = await sendOrder(admin, 4);
    await stores.purchaseOrders.receive({
      lengthMm: null,
      partId: PART_ID,
      purchaseOrderId: purchaseOrder.id,
      quantity: 4,
      unitCost: null,
    });
    const documentId = await fileInvoice(context.db, purchaseOrder.id);

    // The panel is prices from end to end, so the price-blind stores role never reaches it at all.
    await expect(stores.purchaseOrders.supplierInvoices({ purchaseOrderId: purchaseOrder.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(stores.purchaseOrders.invoicePriceVariance()).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const review = await procurement.purchaseOrders.supplierInvoices({ purchaseOrderId: purchaseOrder.id });
    expect(review.items[0]).toMatchObject({ invoiceNumber: 'INV-ROUTER-1', readable: true });
    expect(review.items[0]?.rows[0]).toMatchObject({
      correction: { canApply: true, newAverageUnitCost: 175 },
      flags: [{ kind: 'price-mismatch' }],
      partId: PART_ID,
    });

    const applyInput = { documentId, partId: PART_ID, purchaseOrderId: purchaseOrder.id };
    await expect(stores.purchaseOrders.applyInvoicePrice(applyInput)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(procurement.purchaseOrders.applyInvoicePrice(applyInput)).resolves.toMatchObject({ kind: 'applied' });
    // One flag takes one decision, whoever clicks it.
    await expect(admin.purchaseOrders.applyInvoicePrice(applyInput)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      admin.purchaseOrders.dismissInvoiceFlag({
        documentId,
        flagKey: 'price-mismatch:not-a-part',
        purchaseOrderId: purchaseOrder.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(procurement.purchaseOrders.invoicePriceVariance()).resolves.toMatchObject({
      items: [{ partCode: 'PO-ROUTER-PART', quantity: 4, resolution: 'applied', varianceValue: 100 }],
    });
  });
});

/**
 * Files an invoice the way the HTTP upload route would, minus the model call. The panel's own gates
 * are what this suite is about; the upload route's gate is tested where the route lives.
 */
async function fileInvoice(db: Db, purchaseOrderId: string): Promise<string> {
  const [document] = await db
    .insert(documents)
    .values({
      byteSize: 4,
      contentType: 'application/pdf',
      filename: 'INV-ROUTER-1.pdf',
      metadata: { type: 'supplier_invoice' },
      ownerType: 'purchase_order',
      purchaseOrderId,
      storageKey: `documents/purchase-order/${purchaseOrderId}/INV-ROUTER-1.pdf`,
      uploaderUserId: 'test-user-id',
    })
    .returning({ id: documents.id });
  if (!document) throw new Error('Supplier invoice fixture was not created');

  await db.insert(invoiceExtractions).values({
    documentId: document.id,
    extraction: {
      invoiceDate: '2026-08-04',
      invoiceNumber: 'INV-ROUTER-1',
      jobCodes: [],
      lines: [
        {
          description: 'Router Part',
          jobCodes: [],
          lineTotal: 700,
          partCode: 'PO-ROUTER-PART',
          quantity: 4,
          unitPrice: 175,
        },
      ],
    },
  });

  return document.id;
}

async function sendOrder(admin: AppRouterCaller, quantity: number) {
  const purchaseOrder = await admin.purchaseOrders.create({ supplierId: SUPPLIER_ID });
  await admin.purchaseOrders.saveDraft({
    expectedDeliveryDate: null,
    id: purchaseOrder.id,
    jobIds: [],
    lines: [{ partId: PART_ID, quantity, unitPrice: 150 }],
    supplierId: SUPPLIER_ID,
  });

  return admin.purchaseOrders.markSent({ id: purchaseOrder.id });
}
