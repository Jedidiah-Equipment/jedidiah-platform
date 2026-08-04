import { describe, expect } from 'vitest';

import { listPurchaseOrderDocuments } from './credit-note-service.js';
import {
  ACTOR_ID,
  LINEAR_PART_ID,
  OTHER_SUPPLIER_PART_ID,
  PIECE_PART_ID,
  receive,
  renderStubPdf,
  SPARE_PART_ID,
  SUPPLIER_ID,
  sendOrder,
  test,
} from './purchase-order-amendment-fixtures.js';
import {
  amendPurchaseOrderAddLine,
  amendPurchaseOrderQuantity,
  amendPurchaseOrderSubstitutePart,
  listPurchaseOrderAmendments,
} from './purchase-order-amendment-service.js';
import { closePurchaseOrderShort, createPurchaseOrder, getPurchaseOrder } from './purchase-order-service.js';

describe('Purchase Order amendments', () => {
  test('moves a line quantity, logs the call that moved it, and files a new PDF revision', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 }]);

    const amended = await amendPurchaseOrderQuantity({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { id: purchaseOrder.id, note: 'Supplier can only send 6', partId: PIECE_PART_ID, quantity: 6 },
      pdfRenderer: renderStubPdf,
      storage: context.storage,
    });
    const amendments = await listPurchaseOrderAmendments({ db: context.db, purchaseOrderId: purchaseOrder.id });
    const documents = await listPurchaseOrderDocuments({ db: context.db, purchaseOrderId: purchaseOrder.id });

    expect(amended.lines).toMatchObject([{ partId: PIECE_PART_ID, quantity: 6, unitPrice: 125.5 }]);
    expect(amendments.items).toMatchObject([
      {
        actorName: 'Amendment Tester',
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
  });

  test('lowers a quantity, but never below what has already turned up', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 20 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 6);

    const amended = await amendPurchaseOrderQuantity({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { id: purchaseOrder.id, note: 'Closing the balance out at what came', partId: PIECE_PART_ID, quantity: 6 },
      pdfRenderer: renderStubPdf,
      storage: context.storage,
    });

    expect(amended.derivedStatus).toBe('received');
    await expect(
      amendPurchaseOrderQuantity({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { id: purchaseOrder.id, note: 'Too far', partId: PIECE_PART_ID, quantity: 5 },
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

    expect(amended.lines.map((line) => line.partId)).toEqual([SPARE_PART_ID, LINEAR_PART_ID]);
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
        input: { id: draft.id, note: 'Drafts are edited, not amended', partId: PIECE_PART_ID, quantity: 1 },
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
        input: { id: closedShort.id, note: 'Remainder was released', partId: PIECE_PART_ID, quantity: 2 },
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
        input: { id: purchaseOrder.id, note: `Now ${quantity}`, partId: PIECE_PART_ID, quantity },
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
