import type { PostReturnToSupplierInput } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { postReturnToSupplier } from '../inventory/return-to-supplier-service.js';
import {
  listPurchaseOrderDocuments,
  listPurchaseOrderReturns,
  listReturnsAwaitingCredit,
  uploadCreditNote,
} from './credit-note-service.js';
import {
  ACTOR_ID,
  type AmendmentTestContext,
  PIECE_PART_ID,
  pdfBytes,
  receive,
  SPARE_PART_ID,
  sendOrder,
  test,
} from './purchase-order-amendment-fixtures.js';

async function postReturn(
  context: AmendmentTestContext,
  overrides: Partial<PostReturnToSupplierInput> & {
    purchaseOrderId: string;
  },
) {
  const result = await postReturnToSupplier({
    actorUserId: ACTOR_ID,
    db: context.db,
    input: {
      lengthMm: null,
      note: null,
      partId: PIECE_PART_ID,
      quantity: 1,
      reason: 'defective',
      ...overrides,
    },
  });

  return result.movement;
}

describe('credit notes', () => {
  test('files a credit note into the order collection and records the returns it settles', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 10);
    const returned = await postReturn(context, { purchaseOrderId: purchaseOrder.id, quantity: 4 });

    const creditNote = await uploadCreditNote({
      actorUserId: ACTOR_ID,
      bytes: pdfBytes(),
      db: context.db,
      filename: 'CN-8891.pdf',
      input: { purchaseOrderId: purchaseOrder.id, stockMovementIds: [returned.id] },
      storage: context.storage,
    });
    const documents = await listPurchaseOrderDocuments({ db: context.db, purchaseOrderId: purchaseOrder.id });
    const returns = await listPurchaseOrderReturns({ db: context.db, purchaseOrderId: purchaseOrder.id });

    expect(creditNote).toMatchObject({ filename: 'CN-8891.pdf', revision: null, type: 'credit_note' });
    // It joins the collection beside the as-sent PDF without becoming a revision of the order.
    expect(documents.items).toMatchObject([
      { filename: 'CN-8891.pdf', revision: null, settledReturnIds: [returned.id], type: 'credit_note' },
      { filename: 'PO-00001.pdf', revision: 1, settledReturnIds: [], type: 'purchase_order' },
    ]);
    expect(returns.items).toMatchObject([
      {
        id: returned.id,
        partCode: 'P-100',
        quantity: 4,
        reason: 'defective',
        settledByDocumentFilename: 'CN-8891.pdf',
        settledByDocumentId: creditNote.id,
        value: 100,
      },
    ]);
  });

  test('keeps the returns one credit note left unanswered on the awaiting-credit list', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [
      { partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 },
      { partId: SPARE_PART_ID, quantity: 10, unitPrice: 5 },
    ]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 10);
    await receive(context, purchaseOrder.id, SPARE_PART_ID, 10);
    const first = await postReturn(context, { purchaseOrderId: purchaseOrder.id, quantity: 2 });
    const second = await postReturn(context, {
      partId: SPARE_PART_ID,
      purchaseOrderId: purchaseOrder.id,
      quantity: 3,
      reason: 'wrong-item',
    });

    await uploadCreditNote({
      actorUserId: ACTOR_ID,
      bytes: pdfBytes(),
      db: context.db,
      filename: 'CN-1.pdf',
      input: { purchaseOrderId: purchaseOrder.id, stockMovementIds: [first.id] },
      storage: context.storage,
    });
    const awaiting = await listReturnsAwaitingCredit({ db: context.db });

    // The order has a credit note; the second return is still owed one. An order-level flag would
    // have gone quiet here, which is exactly why the reference is per movement (spec §12).
    expect(awaiting.items).toMatchObject([
      {
        daysOutstanding: 0,
        id: second.id,
        partCode: 'P-110',
        purchaseOrderCode: 'PO-00001',
        quantity: 3,
        reason: 'wrong-item',
        supplierName: 'Acme Supplies',
        value: 15,
      },
    ]);
  });

  test('refuses a second credit note over the same return, and one pointing at another order', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    const otherOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 10);
    const returned = await postReturn(context, { purchaseOrderId: purchaseOrder.id, quantity: 2 });

    await uploadCreditNote({
      actorUserId: ACTOR_ID,
      bytes: pdfBytes(),
      db: context.db,
      filename: 'CN-1.pdf',
      input: { purchaseOrderId: purchaseOrder.id, stockMovementIds: [returned.id] },
      storage: context.storage,
    });

    await expect(
      uploadCreditNote({
        actorUserId: ACTOR_ID,
        bytes: pdfBytes(),
        db: context.db,
        filename: 'CN-2.pdf',
        input: { purchaseOrderId: purchaseOrder.id, stockMovementIds: [returned.id] },
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'credit_note.already_settled' });

    await expect(
      uploadCreditNote({
        actorUserId: ACTOR_ID,
        bytes: pdfBytes(),
        db: context.db,
        filename: 'CN-3.pdf',
        input: { purchaseOrderId: otherOrder.id, stockMovementIds: [returned.id] },
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'credit_note.return_not_found' });

    // A refused upload leaves nothing behind in the order's collection.
    await expect(
      listPurchaseOrderDocuments({ db: context.db, purchaseOrderId: purchaseOrder.id }),
    ).resolves.toMatchObject({ items: [{ filename: 'CN-1.pdf' }, { filename: 'PO-00001.pdf' }] });
  });

  test('reports a repeated filename as a conflict rather than a raw constraint failure', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 10);
    const first = await postReturn(context, { purchaseOrderId: purchaseOrder.id, quantity: 2 });
    const second = await postReturn(context, { purchaseOrderId: purchaseOrder.id, quantity: 3 });

    await uploadCreditNote({
      actorUserId: ACTOR_ID,
      bytes: pdfBytes(),
      db: context.db,
      filename: 'CN-1.pdf',
      input: { purchaseOrderId: purchaseOrder.id, stockMovementIds: [first.id] },
      storage: context.storage,
    });

    // A Supplier sending two credits under one reference is a naming clash the uploader can fix,
    // the same way the Job, Quote and Product document paths report it.
    await expect(
      uploadCreditNote({
        actorUserId: ACTOR_ID,
        bytes: pdfBytes(),
        db: context.db,
        filename: 'CN-1.pdf',
        input: { purchaseOrderId: purchaseOrder.id, stockMovementIds: [second.id] },
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'document.duplicate_filename' });

    // The second return is still owed a credit, and nothing half-written was left behind.
    await expect(listReturnsAwaitingCredit({ db: context.db })).resolves.toMatchObject({ items: [{ id: second.id }] });
    await expect(
      listPurchaseOrderDocuments({ db: context.db, purchaseOrderId: purchaseOrder.id }),
    ).resolves.toMatchObject({ items: [{ filename: 'CN-1.pdf' }, { filename: 'PO-00001.pdf' }] });
  });

  test('has nothing to chase before anything has gone back', async ({ context }) => {
    await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 25 }]);

    await expect(listReturnsAwaitingCredit({ db: context.db })).resolves.toEqual({ items: [] });
  });
});
