import { deriveMovementWarnings } from '@pkg/domain';
import { describe, expect } from 'vitest';

import { postReceipt } from '../inventory/receipt-service.js';

import { postReturnToSupplier } from '../inventory/return-to-supplier-service.js';
import { listStockOnHand } from '../inventory/stock-movement-service.js';
import {
  ACTOR_ID,
  LINEAR_PART_ID,
  PIECE_PART_ID,
  receive,
  renderStubPdf,
  SPARE_PART_ID,
  sendOrder,
  test,
} from './purchase-order-amendment-fixtures.js';
import { amendPurchaseOrderSubstitutePart } from './purchase-order-amendment-service.js';
import { getPurchaseOrder } from './purchase-order-service.js';

describe('postReturnToSupplier', () => {
  test('reverses at the stamped receipt cost, carries the reason, and stays on the line', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 10);

    const result = await postReturnToSupplier({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        lengthMm: null,
        note: 'Threads stripped',
        partId: PIECE_PART_ID,
        purchaseOrderId: purchaseOrder.id,
        quantity: 4,
        reason: 'defective',
      },
    });
    const stockOnHand = await listStockOnHand({ db: context.db });
    const piece = stockOnHand.items.find((row) => row.partId === PIECE_PART_ID);

    expect(result).toMatchObject({
      movement: {
        delta: -4,
        jobId: null,
        movementType: 'return-to-supplier',
        note: 'Threads stripped',
        purchaseOrderId: purchaseOrder.id,
        reason: 'defective',
        unitCost: 25,
      },
      warnings: [],
    });
    expect(piece?.quantity).toBe(6);
    // The stock that stayed arrived at 25 and is still worth 25; a return moves quantity, not price.
    expect(piece?.averageUnitCost).toBe(25);
  });

  test('weights the reversal across receipts posted at different prices', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 10 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 2, 10);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 2, 30);

    const result = await postReturnToSupplier({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        lengthMm: null,
        note: null,
        partId: PIECE_PART_ID,
        purchaseOrderId: purchaseOrder.id,
        quantity: 1,
        reason: 'wrong-item',
      },
    });

    expect(result.movement.unitCost).toBe(20);
  });

  test('warns and still posts when more goes back than the line ever took in', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 2);

    await expect(
      postReturnToSupplier({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          lengthMm: null,
          note: null,
          partId: PIECE_PART_ID,
          purchaseOrderId: purchaseOrder.id,
          quantity: 3,
          reason: 'order-error',
        },
      }),
    ).resolves.toMatchObject({ movement: { delta: -3 }, warnings: ['exceeds-received'] });
  });

  test('takes the standard purchase length for linear stock unless a short piece keys its own', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: LINEAR_PART_ID, quantity: 5, unitPrice: 600 }]);
    await receive(context, purchaseOrder.id, LINEAR_PART_ID, 3);

    const defaulted = await postReturnToSupplier({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        lengthMm: null,
        note: null,
        partId: LINEAR_PART_ID,
        purchaseOrderId: purchaseOrder.id,
        quantity: 1,
        reason: 'defective',
      },
    });

    expect(defaulted.movement).toMatchObject({ lengthMm: 6_000, unitCost: 600 });
  });

  test('has no cost to stamp once everything received has already gone back', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 2);
    const returnInput = {
      lengthMm: null,
      note: null,
      partId: PIECE_PART_ID,
      purchaseOrderId: purchaseOrder.id,
      quantity: 2,
      reason: 'defective',
    } as const;

    await postReturnToSupplier({ actorUserId: ACTOR_ID, db: context.db, input: { ...returnInput } });
    const second = await postReturnToSupplier({ actorUserId: ACTOR_ID, db: context.db, input: { ...returnInput } });

    // Nothing is outstanding to price, so the row is uncosted rather than inventing a value.
    expect(second.movement).toMatchObject({ delta: -2, unitCost: null });
    expect(second.warnings).toEqual(['exceeds-received']);
  });

  test('reopens the line for a replacement, but not when the order itself was the error', async ({ context }) => {
    const replaced = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    const misordered = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, replaced.id, PIECE_PART_ID, 10);
    await receive(context, misordered.id, PIECE_PART_ID, 10);
    const returnInput = { lengthMm: null, note: null, partId: PIECE_PART_ID, quantity: 4 } as const;

    await postReturnToSupplier({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { ...returnInput, purchaseOrderId: replaced.id, reason: 'defective' },
    });
    await postReturnToSupplier({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { ...returnInput, purchaseOrderId: misordered.id, reason: 'order-error' },
    });

    // Four defective went back, so the Supplier still owes four and the order is open again.
    await expect(getPurchaseOrder({ db: context.db, id: replaced.id })).resolves.toMatchObject({
      derivedStatus: 'partially-received',
      lines: [{ receivedQuantity: 6 }],
    });
    // We ordered the wrong thing; nothing is coming in its place, so the line stays satisfied.
    await expect(getPurchaseOrder({ db: context.db, id: misordered.id })).resolves.toMatchObject({
      derivedStatus: 'received',
      lines: [{ receivedQuantity: 10 }],
    });

    // The replacement delivery is expected, so it must not read as an over-receipt.
    await expect(receive(context, replaced.id, PIECE_PART_ID, 4)).resolves.toMatchObject({ warnings: [] });
  });

  test('floors an over-return at nothing received rather than owing more than was ordered', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 2);

    // Five back off a line that took two: the excess warns and posts, but the order is owed ten,
    // never twelve — a negative received quantity would inflate the line and the plant's On Order.
    await postReturnToSupplier({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        lengthMm: null,
        note: null,
        partId: PIECE_PART_ID,
        purchaseOrderId: purchaseOrder.id,
        quantity: 5,
        reason: 'defective',
      },
    });

    await expect(getPurchaseOrder({ db: context.db, id: purchaseOrder.id })).resolves.toMatchObject({
      derivedStatus: 'sent',
      lines: [{ hasStockMovements: true, quantity: 10, receivedQuantity: 0 }],
    });
  });

  test('marks a fully returned line as still carrying movements, so its Part cannot be swapped', async ({
    context,
  }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 4);
    await postReturnToSupplier({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        lengthMm: null,
        note: null,
        partId: PIECE_PART_ID,
        purchaseOrderId: purchaseOrder.id,
        quantity: 4,
        reason: 'defective',
      },
    });

    // Received reads zero again — the line is owed its stock — but the ledger rows are still there.
    const after = await getPurchaseOrder({ db: context.db, id: purchaseOrder.id });
    expect(after.lines).toMatchObject([{ hasStockMovements: true, receivedQuantity: 0 }]);

    await expect(
      amendPurchaseOrderSubstitutePart({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          id: purchaseOrder.id,
          newPartId: SPARE_PART_ID,
          note: 'Too late',
          partId: PIECE_PART_ID,
          quantity: 4,
          unitPrice: 25,
        },
        pdfRenderer: renderStubPdf,
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.substitution_has_receipts' });
  });

  test('only ever attaches to a line of a sent order', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 25 }]);

    await expect(
      postReturnToSupplier({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          lengthMm: null,
          note: null,
          partId: SPARE_PART_ID,
          purchaseOrderId: purchaseOrder.id,
          quantity: 1,
          reason: 'defective',
        },
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.line_not_found' });
  });
});

describe('what a preview is served against what the post judges', () => {
  test('serves the same bucket verdict the post reaches, on a line received in two lengths', async ({ context }) => {
    // The property the shared derivation exists for. The served facts and the post's own pool are
    // two queries over the same rows, so this is where they could drift apart — and a linear line
    // received in two lengths is where a Part-wide threshold used to disagree with the ledger.
    const purchaseOrder = await sendOrder(context, [{ partId: LINEAR_PART_ID, quantity: 20, unitPrice: 40 }]);
    await postReceipt({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { lengthMm: 6_000, partId: LINEAR_PART_ID, purchaseOrderId: purchaseOrder.id, quantity: 5, unitCost: 40 },
    });
    await postReceipt({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { lengthMm: 3_000, partId: LINEAR_PART_ID, purchaseOrderId: purchaseOrder.id, quantity: 2, unitCost: 20 },
    });

    const served = await getPurchaseOrder({ db: context.db, id: purchaseOrder.id });
    const line = served.lines.find((candidate) => candidate.partId === LINEAR_PART_ID);
    const bucketFor = (lengthMm: number) =>
      line?.receiptBuckets.find((bucket) => bucket.lengthMm === lengthMm)?.outstandingReceivedQuantity ?? 0;

    // Part-wide there are seven pieces, so a Part-wide threshold would call this return fine.
    expect(bucketFor(6_000)).toBe(5);
    expect(bucketFor(3_000)).toBe(2);

    const previewed = deriveMovementWarnings({
      facts: { kind: 'return-to-supplier', outstandingReceivedQuantity: bucketFor(3_000) },
      quantity: 3,
    });
    const posted = await postReturnToSupplier({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        lengthMm: 3_000,
        note: null,
        partId: LINEAR_PART_ID,
        purchaseOrderId: purchaseOrder.id,
        quantity: 3,
        reason: 'wrong-item',
      },
    });

    expect(previewed).toEqual(['exceeds-received']);
    expect(posted.warnings).toEqual(previewed);
  });

  test('serves a bucket the next return will be judged against, once one has gone back', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 10);
    await postReturnToSupplier({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        lengthMm: null,
        note: null,
        partId: PIECE_PART_ID,
        purchaseOrderId: purchaseOrder.id,
        quantity: 4,
        reason: 'order-error',
      },
    });

    const served = await getPurchaseOrder({ db: context.db, id: purchaseOrder.id });
    const outstandingReceivedQuantity =
      served.lines
        .find((candidate) => candidate.partId === PIECE_PART_ID)
        ?.receiptBuckets.find((bucket) => bucket.lengthMm === null)?.outstandingReceivedQuantity ?? 0;

    // Every reason nets out of the pool, `order-error` included — what is left is what can go back.
    expect(outstandingReceivedQuantity).toBe(6);

    const previewed = deriveMovementWarnings({
      facts: { kind: 'return-to-supplier', outstandingReceivedQuantity },
      quantity: 7,
    });
    const posted = await postReturnToSupplier({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        lengthMm: null,
        note: null,
        partId: PIECE_PART_ID,
        purchaseOrderId: purchaseOrder.id,
        quantity: 7,
        reason: 'defective',
      },
    });

    expect(previewed).toEqual(['exceeds-received']);
    expect(posted.warnings).toEqual(previewed);
  });
});
