import { randomUUID } from 'node:crypto';
import { auditEvents, user } from '@pkg/db';
import { purchaseOrderAmendments, supplier } from '@pkg/db/equipment';
import { DateOnlyIso } from '@pkg/schema';
import type { PurchaseOrderPdfModel } from '@pkg/schema/equipment';
import { and, eq } from 'drizzle-orm';
import { describe, expect, vi } from 'vitest';

import { listPurchaseOrderDocuments } from './credit-note-service.js';
import {
  ACTOR_ID,
  LINEAR_PART_ID,
  OTHER_SUPPLIER_PART_ID,
  PIECE_PART_ID,
  partLineId,
  receive,
  renderStubPdf,
  SPARE_PART_ID,
  SUPPLIER_ID,
  sendCustomOrder,
  sendOrder,
  test,
} from './purchase-order-amendment-fixtures.js';
import {
  amendPurchaseOrderAddCustomLine,
  amendPurchaseOrderAddLine,
  amendPurchaseOrderExpectedDate,
  amendPurchaseOrderQuantity,
  amendPurchaseOrderRemoveCustomLine,
  amendPurchaseOrderSubstitutePart,
  listPurchaseOrderAmendments,
} from './purchase-order-amendment-service.js';
import { closePurchaseOrderShort, createPurchaseOrder, getPurchaseOrder } from './purchase-order-service.js';
import { listLatePurchaseOrders } from './purchase-order-signals.js';

describe('Purchase Order amendments', () => {
  test('database refuses amendment rows that name both line types or remove a Part Line', async ({ context }) => {
    const order = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 2, unitPrice: 20 }]);
    const base = { actorUserId: ACTOR_ID, purchaseOrderId: order.id, note: 'Invalid shape', oldQuantity: 2 };
    await expect(
      context.db.insert(purchaseOrderAmendments).values({
        ...base,
        kind: 'quantity-change',
        partId: PIECE_PART_ID,
        lineId: order.lines[0]?.id,
        customDescription: 'Wrong',
        newQuantity: 3,
      }),
    ).rejects.toThrow();
    await expect(
      context.db.insert(purchaseOrderAmendments).values({ ...base, kind: 'remove-line', partId: PIECE_PART_ID }),
    ).rejects.toThrow();
  });
  test('amends a Custom Line above its arrived quantity and files its new PDF revision', async ({ context }) => {
    const order = await sendCustomOrder(context, [{ description: 'Office chair', quantity: 5, unitPrice: 800 }]);
    const lineId = order.lines[0]?.id;
    if (!lineId) throw new Error('Missing custom line');
    const render = vi.fn(async (_input: { document: PurchaseOrderPdfModel; filename: string }) => renderStubPdf());
    const amended = await amendPurchaseOrderQuantity({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { id: order.id, lineId, note: 'Supplier confirmed three extra', quantity: 8 },
      pdfRenderer: render,
      storage: context.storage,
    });
    expect(amended.lines[0]?.quantity).toBe(8);
    expect((await listPurchaseOrderAmendments({ db: context.db, purchaseOrderId: order.id })).items[0]).toMatchObject({
      customDescription: 'Office chair',
      kind: 'quantity-change',
      lineId,
      newQuantity: 8,
      oldQuantity: 5,
      note: 'Supplier confirmed three extra',
    });
    expect(
      (await listPurchaseOrderDocuments({ db: context.db, purchaseOrderId: order.id })).items.map(
        (row) => row.revision,
      ),
    ).toEqual([2, 1]);
    expect(render.mock.calls[0]?.[0].document.lines[0]).toMatchObject({ quantity: 8 });
    const lowered = await amendPurchaseOrderQuantity({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { id: order.id, lineId, note: 'Supplier reduced the shipment', quantity: 4 },
      pdfRenderer: renderStubPdf,
      storage: context.storage,
    });
    expect(lowered.lines[0]?.quantity).toBe(4);
  });

  test('cannot amend a Custom Line below arrived quantity or remove one with reversed Arrival history', async ({
    context,
  }) => {
    const order = await sendCustomOrder(context, [
      { description: 'Office chair', quantity: 5, unitPrice: 800 },
      { description: 'Desk lamp', quantity: 1, unitPrice: 80 },
    ]);
    const lineId = order.lines[0]?.id;
    if (!lineId) throw new Error('Missing custom line');
    const { postArrival } = await import('./arrival-service.js');
    await postArrival({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { purchaseOrderId: order.id, lineId, quantity: 2, note: null },
    });
    await expect(
      amendPurchaseOrderQuantity({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { id: order.id, lineId, note: 'Too low', quantity: 1 },
        pdfRenderer: renderStubPdf,
        storage: context.storage,
      }),
    ).rejects.toThrow(/Office chair.*already taken 2/);
    await postArrival({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { purchaseOrderId: order.id, lineId, quantity: -2, note: 'Wrong arrival' },
    });
    await expect(
      amendPurchaseOrderRemoveCustomLine({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { id: order.id, lineId, note: 'Wrong item' },
        pdfRenderer: renderStubPdf,
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.amendment_line_has_arrivals' });
  });

  test('adds and removes Custom Lines while preserving descriptions in the log', async ({ context }) => {
    const newSupplierId = '00000000-0000-4000-8000-000000000999';
    await context.db.insert(supplier).values({ id: newSupplierId, companyName: 'One-off supplier' });
    const order = await sendCustomOrder(
      context,
      [{ description: 'Office chair', quantity: 5, unitPrice: 800 }],
      newSupplierId,
    );
    await expect(
      amendPurchaseOrderAddCustomLine({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          id: order.id,
          description: 'Unpriced lamp',
          quantity: 1,
          supplierCode: null,
          unit: 'each',
          unitPrice: 0,
          note: 'Phone call',
        },
        pdfRenderer: renderStubPdf,
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.line_not_priced' });
    const added = await amendPurchaseOrderAddCustomLine({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        id: order.id,
        description: 'Desk lamp',
        quantity: 2,
        supplierCode: null,
        unit: 'each',
        unitPrice: 80,
        note: 'Phone call',
      },
      pdfRenderer: renderStubPdf,
      storage: context.storage,
    });
    expect(added.lines.map((line) => line.description)).toEqual(['Office chair', 'Desk lamp']);
    const lampId = added.lines[1]?.id;
    if (!lampId) throw new Error('Missing added line');
    const removed = await amendPurchaseOrderRemoveCustomLine({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { id: order.id, lineId: lampId, note: 'Ordered in error' },
      pdfRenderer: renderStubPdf,
      storage: context.storage,
    });
    expect(removed.lines.map((line) => line.description)).toEqual(['Office chair']);
    expect((await listPurchaseOrderAmendments({ db: context.db, purchaseOrderId: order.id })).items).toMatchObject([
      { kind: 'add-line', lineId: lampId, customDescription: 'Desk lamp' },
      { kind: 'remove-line', lineId: lampId, customDescription: 'Desk lamp', note: 'Ordered in error' },
    ]);
    expect(
      (await listPurchaseOrderDocuments({ db: context.db, purchaseOrderId: order.id })).items.map(
        (row) => row.revision,
      ),
    ).toEqual([3, 2, 1]);
    await expect(
      amendPurchaseOrderRemoveCustomLine({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { id: order.id, lineId: order.lines[0]?.id ?? '', note: 'Last line' },
        pdfRenderer: renderStubPdf,
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.amendment_last_line' });
  });

  test('changes the expected delivery date, logs the call, revises the PDF, and makes an overdue order late', async ({
    context,
  }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 }]);

    const amended = await amendPurchaseOrderExpectedDate({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        expectedDeliveryDate: DateOnlyIso.parse('2026-08-03'),
        id: purchaseOrder.id,
        note: 'Supplier promised Monday instead',
      },
      pdfRenderer: renderStubPdf,
      storage: context.storage,
    });

    expect(amended.expectedDeliveryDate).toBe('2026-08-03');
    await expect(
      listPurchaseOrderAmendments({ db: context.db, purchaseOrderId: purchaseOrder.id }),
    ).resolves.toMatchObject({
      items: [
        {
          actorName: 'Amendment Tester',
          kind: 'expected-date-change',
          newExpectedDate: '2026-08-03',
          note: 'Supplier promised Monday instead',
          oldExpectedDate: null,
          partId: null,
        },
      ],
    });
    await expect(
      listPurchaseOrderDocuments({ db: context.db, purchaseOrderId: purchaseOrder.id }),
    ).resolves.toMatchObject({
      items: [{ revision: 2 }, { revision: 1 }],
    });
    await expect(
      listLatePurchaseOrders({ clock: () => new Date('2026-08-04T08:00:00.000Z'), db: context.db }),
    ).resolves.toMatchObject({ items: [{ id: purchaseOrder.id, expectedDeliveryDate: '2026-08-03' }] });
    const audit = await context.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, 'updated'),
          eq(auditEvents.entityId, purchaseOrder.id),
          eq(auditEvents.entityType, 'purchase_order'),
        ),
      )
      .orderBy(auditEvents.occurredAt, auditEvents.id);
    expect(audit.at(-1)).toMatchObject({
      actorUserId: ACTOR_ID,
      changes: { expectedDeliveryDate: { from: null, to: '2026-08-03' } },
      summary: 'Updated Purchase Order "PO-00001"',
    });
  });

  test('moves a line quantity, logs the call that moved it, and files a new PDF revision', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 }]);
    const amenderId = 'po-line-amender';
    await context.db.insert(user).values({
      createdAt: new Date(),
      email: 'po-line-amender@example.com',
      emailVerified: true,
      id: amenderId,
      name: 'Line Amender',
      role: 'admin',
      updatedAt: new Date(),
    });
    const render = vi.fn(async (_input: { document: PurchaseOrderPdfModel; filename: string }) => renderStubPdf());

    const amended = await amendPurchaseOrderQuantity({
      actorUserId: amenderId,
      db: context.db,
      input: {
        id: purchaseOrder.id,
        lineId: partLineId(purchaseOrder, PIECE_PART_ID),
        note: 'Supplier can only send 6',
        quantity: 6,
      },
      pdfRenderer: render,
      storage: context.storage,
    });
    const amendments = await listPurchaseOrderAmendments({ db: context.db, purchaseOrderId: purchaseOrder.id });
    const documents = await listPurchaseOrderDocuments({ db: context.db, purchaseOrderId: purchaseOrder.id });

    expect(amended.lines).toMatchObject([{ partId: PIECE_PART_ID, quantity: 6, unitPrice: 125.5 }]);
    expect(amendments.items).toMatchObject([
      {
        actorName: 'Line Amender',
        kind: 'quantity-change',
        newPartId: null,
        newQuantity: 6,
        note: 'Supplier can only send 6',
        oldQuantity: 4,
        partCode: 'P-100',
      },
    ]);
    // The as-sent original survives; the amendment files a further revision beside it.
    expect(documents.items.map((item) => ({ filename: item.filename, revision: item.revision }))).toEqual([
      { filename: 'PO-00001 rev 2.pdf', revision: 2 },
      { filename: 'PO-00001.pdf', revision: 1 },
    ]);
    // The current PDF the order points at is the newest revision.
    expect(amended.documentId).toBe(documents.items[0]?.id);
    expect(render).toHaveBeenCalledWith({
      document: expect.objectContaining({
        lastModified: {
          actorName: 'Line Amender',
          occurredAt: amendments.items[0]?.createdAt,
        },
      }),
      filename: 'PO-00001 rev 2.pdf',
    });
  });

  test('lowers a quantity, but never below what has already turned up', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 20 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 6);

    const amended = await amendPurchaseOrderQuantity({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        id: purchaseOrder.id,
        lineId: partLineId(purchaseOrder, PIECE_PART_ID),
        note: 'Closing the balance out at what came',
        quantity: 6,
      },
      pdfRenderer: renderStubPdf,
      storage: context.storage,
    });

    expect(amended.derivedStatus).toBe('received');
    await expect(
      amendPurchaseOrderQuantity({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { id: purchaseOrder.id, lineId: partLineId(purchaseOrder, PIECE_PART_ID), note: 'Too far', quantity: 5 },
        pdfRenderer: renderStubPdf,
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.amendment_below_received' });
  });

  test('adds the line the order should have carried, held to the draft rules', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 }]);

    const amended = await amendPurchaseOrderAddLine({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { id: purchaseOrder.id, note: 'Phoned through', partId: SPARE_PART_ID, quantity: 2, unitPrice: 40 },
      pdfRenderer: renderStubPdf,
      storage: context.storage,
    });

    expect(amended.lines).toMatchObject([
      { partId: PIECE_PART_ID, quantity: 4 },
      { partId: SPARE_PART_ID, quantity: 2, unitPrice: 40 },
    ]);
    await expect(
      listPurchaseOrderAmendments({ db: context.db, purchaseOrderId: purchaseOrder.id }),
    ).resolves.toMatchObject({ items: [{ kind: 'add-line', newQuantity: 2, oldQuantity: null, partCode: 'P-110' }] });

    // Same Part twice, another Supplier's Part, and an unpriced line are all refused as on a draft.
    await expect(
      amendPurchaseOrderAddLine({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { id: purchaseOrder.id, note: 'Again', partId: SPARE_PART_ID, quantity: 1, unitPrice: 40 },
        pdfRenderer: renderStubPdf,
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.line_exists' });
    await expect(
      amendPurchaseOrderAddLine({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          id: purchaseOrder.id,
          note: 'Wrong supplier',
          partId: OTHER_SUPPLIER_PART_ID,
          quantity: 1,
          unitPrice: 40,
        },
        pdfRenderer: renderStubPdf,
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.part_supplier_mismatch' });
    await expect(
      amendPurchaseOrderAddLine({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { id: purchaseOrder.id, note: 'Unpriced', partId: LINEAR_PART_ID, quantity: 1, unitPrice: 0 },
        pdfRenderer: renderStubPdf,
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.line_not_priced' });
  });

  test('substitutes a Part on an untouched line and refuses one that has taken delivery', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [
      { partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 },
      { partId: LINEAR_PART_ID, quantity: 2, unitPrice: 900 },
    ]);

    const amended = await amendPurchaseOrderSubstitutePart({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        id: purchaseOrder.id,
        newPartId: SPARE_PART_ID,
        note: 'Supplier is out of P-100',
        partId: PIECE_PART_ID,
        quantity: 4,
        unitPrice: 130,
      },
      pdfRenderer: renderStubPdf,
      storage: context.storage,
    });

    expect(amended.lines).toMatchObject([{ partId: SPARE_PART_ID }, { partId: LINEAR_PART_ID }]);
    await expect(
      listPurchaseOrderAmendments({ db: context.db, purchaseOrderId: purchaseOrder.id }),
    ).resolves.toMatchObject({
      items: [{ kind: 'substitute-part', newPartCode: 'P-110', newQuantity: 4, oldQuantity: 4, partCode: 'P-100' }],
    });

    // Receipts key off (order, Part), so a delivered line can never have its Part swapped under them.
    await receive(context, purchaseOrder.id, LINEAR_PART_ID, 1);
    await expect(
      amendPurchaseOrderSubstitutePart({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          id: purchaseOrder.id,
          newPartId: PIECE_PART_ID,
          note: 'Too late',
          partId: LINEAR_PART_ID,
          quantity: 2,
          unitPrice: 900,
        },
        pdfRenderer: renderStubPdf,
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.substitution_has_receipts' });
  });

  test('leaves drafts log-free, and refuses an order nobody can still change', async ({ context }) => {
    const draft = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_ID },
    });

    await expect(
      amendPurchaseOrderQuantity({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { id: draft.id, lineId: randomUUID(), note: 'Drafts are edited, not amended', quantity: 1 },
        pdfRenderer: renderStubPdf,
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.not_sent' });
    await expect(listPurchaseOrderAmendments({ db: context.db, purchaseOrderId: draft.id })).resolves.toEqual({
      items: [],
    });

    const closedShort = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 }]);
    await receive(context, closedShort.id, PIECE_PART_ID, 1);
    await closePurchaseOrderShort({ actorUserId: ACTOR_ID, db: context.db, id: closedShort.id });

    await expect(
      amendPurchaseOrderQuantity({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          id: closedShort.id,
          lineId: partLineId(closedShort, PIECE_PART_ID),
          note: 'Remainder was released',
          quantity: 2,
        },
        pdfRenderer: renderStubPdf,
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.closed_short' });
  });

  test('numbers revisions in order across repeated amendments', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 }]);

    for (const quantity of [5, 6, 7]) {
      await amendPurchaseOrderQuantity({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          id: purchaseOrder.id,
          lineId: partLineId(purchaseOrder, PIECE_PART_ID),
          note: `Now ${quantity}`,
          quantity,
        },
        pdfRenderer: renderStubPdf,
        storage: context.storage,
      });
    }

    const documents = await listPurchaseOrderDocuments({ db: context.db, purchaseOrderId: purchaseOrder.id });
    const current = await getPurchaseOrder({ db: context.db, id: purchaseOrder.id });

    // Sent as revision 1, then one further revision per amendment.
    expect(documents.items.map((item) => item.revision)).toEqual([4, 3, 2, 1]);
    expect(current.documentId).toBe(documents.items[0]?.id);
  });
});
