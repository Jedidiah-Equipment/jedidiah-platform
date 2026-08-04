import { describe, expect } from 'vitest';

import { postReturnToSupplier } from '../inventory/return-to-supplier-service.js';
import { listStockOnHand } from '../inventory/stock-movement-service.js';
import {
  ACTOR_ID,
  LINEAR_PART_ID,
  PIECE_PART_ID,
  receive,
  SPARE_PART_ID,
  sendOrder,
  test,
} from './purchase-order-amendment-fixtures.js';
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
