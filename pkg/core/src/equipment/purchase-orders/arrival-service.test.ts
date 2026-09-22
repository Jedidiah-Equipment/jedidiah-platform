import { user } from '@pkg/db';
import { parts, purchaseOrderLines, purchaseOrders, supplier } from '@pkg/db/equipment';
import { PostArrivalInput } from '@pkg/schema/equipment';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../../test/create-tester.js';
import { postReceipt } from '../inventory/receipt-service.js';
import { partValues, seedPartCategory } from '../test/part-fixtures.js';
import { listPurchaseOrderArrivals, postArrival } from './arrival-service.js';
import { closePurchaseOrderShort, getPurchaseOrder, loadOpenOrderLines } from './purchase-order-service.js';

const actorUserId = 'arrival-test-user';
const supplierId = '00000000-0000-4000-8000-000000000701';
const partId = '00000000-0000-4000-8000-000000000702';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    createdAt: new Date(),
    email: 'arrival@example.com',
    emailVerified: true,
    id: actorUserId,
    name: 'Arrival Tester',
    role: 'admin',
    updatedAt: new Date(),
  });
  await db.insert(supplier).values({ companyName: 'Arrival Supplier', id: supplierId });
  const categoryId = await seedPartCategory(db);
  await db
    .insert(parts)
    .values({ ...partValues({ categoryId, code: 'ARR-1', supplierId, unitOfMeasure: 'piece' }), id: partId });
  return {};
});

async function order(db: Parameters<typeof getPurchaseOrder>[0]['db'], mixed = false) {
  const [row] = await db
    .insert(purchaseOrders)
    .values({ approvedAt: new Date(), sentAt: new Date(), status: 'sent', supplierId })
    .returning({ id: purchaseOrders.id });
  if (!row) throw new Error('Order fixture insert failed');
  const [line] = await db
    .insert(purchaseOrderLines)
    .values({
      customDescription: 'Packing tape',
      customUnit: 'box',
      purchaseOrderId: row.id,
      quantity: 2.5,
      unitPrice: 80,
    })
    .returning({ id: purchaseOrderLines.id });
  if (!line) throw new Error('Line fixture insert failed');
  if (mixed)
    await db.insert(purchaseOrderLines).values({ partId, purchaseOrderId: row.id, quantity: 1, unitPrice: 10 });
  return { id: row.id, lineId: line.id };
}

describe('Custom Line Arrivals', () => {
  test('moves a custom-only order through partial and received while keeping stock cover empty', async ({
    context,
  }) => {
    const { id, lineId } = await order(context.db);
    const input = { lineId, note: null, purchaseOrderId: id, quantity: 1 };
    const first = await postArrival({ actorUserId, db: context.db, input });
    expect(first).toMatchObject({
      arrival: { actorName: 'Arrival Tester', lineDescription: 'Packing tape', quantity: 1 },
      warnings: [],
    });
    expect(await getPurchaseOrder({ db: context.db, id })).toMatchObject({
      derivedStatus: 'partially-received',
      actions: { cancel: { allowed: false, reason: 'has-movements' }, closeShort: { allowed: true } },
      lines: [{ hasStockMovements: true, receivedQuantity: 1 }],
    });
    await expect(loadOpenOrderLines({ db: context.db })).resolves.toEqual([]);
    await postArrival({ actorUserId, db: context.db, input: { ...input, quantity: 1.5 } });
    expect(await getPurchaseOrder({ db: context.db, id })).toMatchObject({
      derivedStatus: 'received',
      actions: { closeShort: { allowed: false, reason: 'fully-received' } },
    });
    expect((await listPurchaseOrderArrivals({ db: context.db, purchaseOrderId: id })).items).toHaveLength(2);
    await postArrival({ actorUserId, db: context.db, input: { ...input, note: 'Miscount', quantity: -2.5 } });
    expect(await getPurchaseOrder({ db: context.db, id })).toMatchObject({
      derivedStatus: 'approved',
      actions: { cancel: { allowed: false, reason: 'has-movements' }, closeShort: { allowed: true } },
      lines: [{ receivedQuantity: 0 }],
    });
  });

  test('mixes receipt and arrival progress, warns on over-arrival, and permits noted reversals after close short', async ({
    context,
  }) => {
    const { id, lineId } = await order(context.db, true);
    await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: null, partId, purchaseOrderId: id, quantity: 1, unitCost: null },
    });
    expect((await getPurchaseOrder({ db: context.db, id })).derivedStatus).toBe('partially-received');
    const posted = await postArrival({
      actorUserId,
      db: context.db,
      input: { lineId, note: null, purchaseOrderId: id, quantity: 3 },
    });
    expect(posted.warnings).toEqual(['exceeds-ordered']);
    expect((await getPurchaseOrder({ db: context.db, id })).derivedStatus).toBe('received');
    await postArrival({
      actorUserId,
      db: context.db,
      input: { lineId, note: 'Wrong count', purchaseOrderId: id, quantity: -2 },
    });
    expect((await getPurchaseOrder({ db: context.db, id })).derivedStatus).toBe('partially-received');
    await closePurchaseOrderShort({ actorUserId, db: context.db, id });
    await expect(
      postArrival({ actorUserId, db: context.db, input: { lineId, note: null, purchaseOrderId: id, quantity: 1 } }),
    ).rejects.toMatchObject({ code: 'purchase_order.closed_short' });
    await expect(
      postArrival({
        actorUserId,
        db: context.db,
        input: { lineId, note: 'Returned after close short', purchaseOrderId: id, quantity: -1 },
      }),
    ).resolves.toMatchObject({ arrival: { quantity: -1 } });
    await expect(
      postArrival({
        actorUserId,
        db: context.db,
        input: { lineId, note: 'More returned', purchaseOrderId: id, quantity: -1 },
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.arrival_below_zero' });
  });

  test('rejects part lines, foreign lines, draft orders, and unnoted reversals', async ({ context }) => {
    const first = await order(context.db, true);
    const second = await order(context.db);
    const [partLine] = await context.db
      .select({ id: purchaseOrderLines.id })
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.partId, partId));
    if (!partLine) throw new Error('Part line missing');
    await expect(
      postArrival({
        actorUserId,
        db: context.db,
        input: { lineId: partLine.id, note: null, purchaseOrderId: first.id, quantity: 1 },
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.line_not_custom' });
    await expect(
      postArrival({
        actorUserId,
        db: context.db,
        input: { lineId: second.lineId, note: null, purchaseOrderId: first.id, quantity: 1 },
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.line_not_found' });
    expect(PostArrivalInput.safeParse({ lineId: first.lineId, purchaseOrderId: first.id, quantity: -1 }).success).toBe(
      false,
    );
    expect(
      PostArrivalInput.safeParse({ lineId: first.lineId, purchaseOrderId: first.id, quantity: 100_000_000_000 })
        .success,
    ).toBe(false);
    await expect(
      postArrival({
        actorUserId,
        db: context.db,
        input: { lineId: first.lineId, note: 'Correction', purchaseOrderId: first.id, quantity: -1 },
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.arrival_below_zero' });
    const [draft] = await context.db.insert(purchaseOrders).values({ supplierId }).returning({ id: purchaseOrders.id });
    if (!draft) throw new Error('Draft fixture insert failed');
    const [draftLine] = await context.db
      .insert(purchaseOrderLines)
      .values({
        customDescription: 'Draft tape',
        customUnit: 'box',
        purchaseOrderId: draft.id,
        quantity: 1,
        unitPrice: 80,
      })
      .returning({ id: purchaseOrderLines.id });
    if (!draftLine) throw new Error('Draft line fixture insert failed');
    await expect(
      postArrival({
        actorUserId,
        db: context.db,
        input: { lineId: draftLine.id, note: null, purchaseOrderId: draft.id, quantity: 1 },
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.not_sent' });
  });
});
