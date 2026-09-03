import { purchaseOrders } from '@pkg/db';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { postReceipt } from '../inventory/receipt-service.js';
import { actorUserId, seedSentPurchaseOrder, test } from '../test/inventory-fixtures.js';
import { listPartPurchaseOrderLines } from './part-order-lines-read.js';

describe('listPartPurchaseOrderLines', () => {
  test('reports what one line ordered, took in, and still owes', async ({ context }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 10 },
    ]);
    await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: null, partId: context.parts.piece.id, purchaseOrderId, quantity: 4, unitCost: null },
    });

    await expect(listPartPurchaseOrderLines({ db: context.db, partId: context.parts.piece.id })).resolves.toMatchObject(
      {
        items: [
          {
            closedShortAt: null,
            orderedQuantity: 10,
            outstandingQuantity: 6,
            purchaseOrderId,
            receivedQuantity: 4,
            supplierName: 'Ledger Supplier',
          },
        ],
      },
    );
  });

  /**
   * The rule the dock turns on: a closed-short line still holds an outstanding quantity, but the
   * receipt service refuses it. Without this flag a receiving screen would offer the line and only
   * discover the refusal on the post.
   */
  test('keeps a closed-short line and marks it, so receiving can tell it apart from a live one', async ({
    context,
  }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 10 },
    ]);
    await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: null, partId: context.parts.piece.id, purchaseOrderId, quantity: 4, unitCost: null },
    });
    await context.db
      .update(purchaseOrders)
      .set({ closedShortAt: new Date('2026-08-03T08:00:00.000Z') })
      .where(eq(purchaseOrders.id, purchaseOrderId));

    const result = await listPartPurchaseOrderLines({ db: context.db, partId: context.parts.piece.id });

    expect(result.items[0]?.outstandingQuantity).toBe(6);
    expect(result.items[0]?.closedShortAt).not.toBeNull();
  });

  test('ignores an order that was never sent, since nothing can arrive against a draft', async ({ context }) => {
    await seedSentPurchaseOrder(context.db, context.supplierId, [{ partId: context.parts.piece.id, quantity: 5 }], {
      status: 'draft',
    });

    await expect(listPartPurchaseOrderLines({ db: context.db, partId: context.parts.piece.id })).resolves.toEqual({
      items: [],
    });
  });

  test('orders earliest promised first, with unpromised orders last', async ({ context }) => {
    const later = await seedSentPurchaseOrder(
      context.db,
      context.supplierId,
      [{ partId: context.parts.piece.id, quantity: 1 }],
      { expectedDeliveryDate: '2026-09-01' },
    );
    const unpromised = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 1 },
    ]);
    const earlier = await seedSentPurchaseOrder(
      context.db,
      context.supplierId,
      [{ partId: context.parts.piece.id, quantity: 1 }],
      { expectedDeliveryDate: '2026-08-10' },
    );

    const result = await listPartPurchaseOrderLines({ db: context.db, partId: context.parts.piece.id });

    expect(result.items.map((line) => line.purchaseOrderId)).toEqual([earlier, later, unpromised]);
  });
});
