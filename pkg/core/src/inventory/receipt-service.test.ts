import { describe, expect } from 'vitest';

import { actorUserId, adjustmentInput, seedSentPurchaseOrder, test } from '../test/inventory-fixtures.js';
import { postReceipt } from './receipt-service.js';
import { listStockOnHand, postAdjustment } from './stock-movement-service.js';

describe('postReceipt', () => {
  test('posts a receipt at the line price and feeds it into stock on hand and the moving average', async ({
    context,
  }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 10, unitPrice: 25 },
    ]);
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 15 }),
    });

    const result = await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: null, partId: context.parts.piece.id, purchaseOrderId, quantity: 10, unitCost: null },
    });
    const stockOnHand = await listStockOnHand({ db: context.db });
    const piece = stockOnHand.items.find((row) => row.partId === context.parts.piece.id);

    expect(result).toMatchObject({
      movement: { delta: 10, jobId: null, movementType: 'receipt', purchaseOrderId, reason: null, unitCost: 25 },
      warnings: [],
    });
    expect(piece?.quantity).toBe(20);
    // Ten pieces at 15 met ten at 25.
    expect(piece?.averageUnitCost).toBeCloseTo(20, 10);
  });

  test('warns and still posts when a delivery takes the line past what was ordered', async ({ context }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 4, unitPrice: 25 },
    ]);

    await expect(
      postReceipt({
        actorUserId,
        db: context.db,
        input: { lengthMm: null, partId: context.parts.piece.id, purchaseOrderId, quantity: 3, unitCost: null },
      }),
    ).resolves.toMatchObject({ warnings: [] });

    await expect(
      postReceipt({
        actorUserId,
        db: context.db,
        input: { lengthMm: null, partId: context.parts.piece.id, purchaseOrderId, quantity: 2, unitCost: null },
      }),
    ).resolves.toMatchObject({ movement: { delta: 2 }, warnings: ['exceeds-ordered'] });
  });

  test('defaults a linear receipt to the standard purchase length and takes an explicit one otherwise', async ({
    context,
  }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.linear.id, quantity: 5, unitPrice: 600 },
    ]);

    const defaulted = await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: null, partId: context.parts.linear.id, purchaseOrderId, quantity: 2, unitCost: null },
    });
    const shortDelivery = await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: 3_000, partId: context.parts.linear.id, purchaseOrderId, quantity: 1, unitCost: null },
    });

    expect(defaulted.movement).toMatchObject({ lengthMm: 6_000, unitCost: 600 });
    expect(shortDelivery.movement).toMatchObject({ lengthMm: 3_000, unitCost: 600 });
  });

  test('takes a desk-side cost correction in place of the line price', async ({ context }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 4, unitPrice: 25 },
    ]);

    const result = await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: null, partId: context.parts.piece.id, purchaseOrderId, quantity: 1, unitCost: 31.5 },
    });

    expect(result.movement.unitCost).toBe(31.5);
  });

  test('receipts periodic raw material, which consumption movements are barred from', async ({ context }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.periodic.id, quantity: 3, unitPrice: 420 },
    ]);

    const result = await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: null, partId: context.parts.periodic.id, purchaseOrderId, quantity: 3, unitCost: null },
    });

    expect(result.movement).toMatchObject({ delta: 3, lengthMm: 6_000, unitCost: 420 });
  });

  test('receives only against an open line of a sent order', async ({ context }) => {
    const draftId = await seedSentPurchaseOrder(
      context.db,
      context.supplierId,
      [{ partId: context.parts.piece.id, quantity: 4, unitPrice: 25 }],
      'draft',
    );
    const sentId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 4, unitPrice: 25 },
    ]);

    await expect(
      postReceipt({
        actorUserId,
        db: context.db,
        input: {
          lengthMm: null,
          partId: context.parts.piece.id,
          purchaseOrderId: draftId,
          quantity: 1,
          unitCost: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.not_sent' });

    await expect(
      postReceipt({
        actorUserId,
        db: context.db,
        input: {
          lengthMm: null,
          partId: context.parts.measured.id,
          purchaseOrderId: sentId,
          quantity: 1,
          unitCost: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.line_not_found' });
  });

  test('holds receipts to the Part unit class', async ({ context }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 10, unitPrice: 25 },
      { partId: context.parts.measured.id, quantity: 10, unitPrice: 25 },
    ]);

    await expect(
      postReceipt({
        actorUserId,
        db: context.db,
        input: { lengthMm: null, partId: context.parts.piece.id, purchaseOrderId, quantity: 1.5, unitCost: null },
      }),
    ).rejects.toMatchObject({ code: 'inventory.invalid_delta' });

    await expect(
      postReceipt({
        actorUserId,
        db: context.db,
        input: { lengthMm: 6_000, partId: context.parts.measured.id, purchaseOrderId, quantity: 1, unitCost: null },
      }),
    ).rejects.toMatchObject({ code: 'inventory.invalid_length' });
  });
});
