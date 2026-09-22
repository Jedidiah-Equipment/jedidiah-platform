import { user } from '@pkg/db';
import { parts, purchaseOrderLines, purchaseOrders, supplier } from '@pkg/db/equipment';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { postReceipt } from '../inventory/receipt-service.js';
import { seedSentPurchaseOrder } from '../test/inventory-fixtures.js';
import { partValues, seedPartCategory } from '../test/part-fixtures.js';
import { postArrival } from './arrival-service.js';
import { listLatePurchaseOrders } from './purchase-order-signals.js';

const ACTOR_ID = 'po-signals-test-user';
const SUPPLIER_ID = '00000000-0000-4000-8000-000000000501';
const PART_ID = '00000000-0000-4000-8000-000000000601';
const OTHER_PART_ID = '00000000-0000-4000-8000-000000000602';
const clock = () => new Date('2026-08-04T08:00:00.000Z');

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    createdAt: new Date(),
    email: 'po-signals@example.com',
    emailVerified: true,
    id: ACTOR_ID,
    name: 'PO Signals Tester',
    role: 'admin',
    updatedAt: new Date(),
  });
  await db.insert(supplier).values({ companyName: 'Slow Supplies', id: SUPPLIER_ID });
  const categoryId = await seedPartCategory(db);
  await db.insert(parts).values([
    { ...partValues({ categoryId, code: 'L-100', supplierId: SUPPLIER_ID, unitOfMeasure: 'piece' }), id: PART_ID },
    {
      ...partValues({ categoryId, code: 'L-200', supplierId: SUPPLIER_ID, unitOfMeasure: 'piece' }),
      id: OTHER_PART_ID,
    },
  ]);

  return {};
});

describe('listLatePurchaseOrders', () => {
  test('lists a sent order past its expected date with an open remainder', async ({ context }) => {
    await seedSentPurchaseOrder(context.db, SUPPLIER_ID, [{ partId: PART_ID, quantity: 4 }], {
      expectedDeliveryDate: '2026-07-30',
    });

    await expect(listLatePurchaseOrders({ clock, db: context.db })).resolves.toEqual({
      items: [
        {
          code: 'PO-00001',
          daysLate: 5,
          expectedDeliveryDate: '2026-07-30',
          id: expect.any(String),
          openLineCount: 1,
          supplierName: 'Slow Supplies',
        },
      ],
    });
  });

  test('counts only the lines still owed', async ({ context }) => {
    const id = await seedSentPurchaseOrder(
      context.db,
      SUPPLIER_ID,
      [
        { partId: PART_ID, quantity: 4 },
        { partId: OTHER_PART_ID, quantity: 2 },
      ],
      { expectedDeliveryDate: '2026-07-30' },
    );
    await postReceipt({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { lengthMm: null, partId: PART_ID, purchaseOrderId: id, quantity: 4, unitCost: null },
    });

    await expect(listLatePurchaseOrders({ clock, db: context.db })).resolves.toMatchObject({
      items: [expect.objectContaining({ openLineCount: 1 })],
    });
  });

  test('keeps Custom Lines in the late signal after every Part Line arrives', async ({ context }) => {
    const customOnly = await context.db
      .insert(purchaseOrders)
      .values({
        approvedAt: new Date('2026-08-01T08:00:00.000Z'),
        expectedDeliveryDate: '2026-07-30',
        sentAt: new Date('2026-08-02T08:00:00.000Z'),
        status: 'sent',
        supplierId: SUPPLIER_ID,
      })
      .returning({ id: purchaseOrders.id });
    const customOnlyId = customOnly[0]?.id;
    if (!customOnlyId) throw new Error('Custom-only order insert failed');
    const mixedId = await seedSentPurchaseOrder(context.db, SUPPLIER_ID, [{ partId: PART_ID, quantity: 4 }], {
      expectedDeliveryDate: '2026-07-30',
    });
    const insertedLines = await context.db
      .insert(purchaseOrderLines)
      .values([
        {
          customDescription: 'Packing tape',
          customUnit: 'box',
          purchaseOrderId: customOnlyId,
          quantity: 2,
          unitPrice: 80,
        },
        {
          customDescription: 'Workshop service',
          customUnit: 'each',
          purchaseOrderId: mixedId,
          quantity: 1,
          unitPrice: 500,
        },
      ])
      .returning({ id: purchaseOrderLines.id });
    await postReceipt({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { lengthMm: null, partId: PART_ID, purchaseOrderId: mixedId, quantity: 4, unitCost: null },
    });

    await expect(listLatePurchaseOrders({ clock, db: context.db })).resolves.toMatchObject({
      items: [
        { id: customOnlyId, openLineCount: 1 },
        { id: mixedId, openLineCount: 1 },
      ],
    });
    const customOnlyLineId = insertedLines[0]?.id;
    if (!customOnlyLineId) throw new Error('Custom line missing');
    await postArrival({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { lineId: customOnlyLineId, note: null, purchaseOrderId: customOnlyId, quantity: 2 },
    });
    await expect(listLatePurchaseOrders({ clock, db: context.db })).resolves.toMatchObject({
      items: [{ id: mixedId, openLineCount: 1 }],
    });
  });

  test('drops an order once every line has arrived', async ({ context }) => {
    const id = await seedSentPurchaseOrder(context.db, SUPPLIER_ID, [{ partId: PART_ID, quantity: 4 }], {
      expectedDeliveryDate: '2026-07-30',
    });
    await postReceipt({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { lengthMm: null, partId: PART_ID, purchaseOrderId: id, quantity: 4, unitCost: null },
    });

    await expect(listLatePurchaseOrders({ clock, db: context.db })).resolves.toEqual({ items: [] });
  });

  test('drops an order whose remainder was released by closing it short', async ({ context }) => {
    const id = await seedSentPurchaseOrder(context.db, SUPPLIER_ID, [{ partId: PART_ID, quantity: 4 }], {
      expectedDeliveryDate: '2026-07-30',
    });
    await context.db
      .update(purchaseOrders)
      .set({ closedShortAt: new Date('2026-08-01T08:00:00.000Z') })
      .where(eq(purchaseOrders.id, id));

    await expect(listLatePurchaseOrders({ clock, db: context.db })).resolves.toEqual({ items: [] });
  });

  test('leaves an order due today, an undated order, and a draft alone', async ({ context }) => {
    await seedSentPurchaseOrder(context.db, SUPPLIER_ID, [{ partId: PART_ID, quantity: 1 }], {
      expectedDeliveryDate: '2026-08-04',
    });
    await seedSentPurchaseOrder(context.db, SUPPLIER_ID, [{ partId: PART_ID, quantity: 1 }]);
    await seedSentPurchaseOrder(context.db, SUPPLIER_ID, [{ partId: PART_ID, quantity: 1 }], {
      expectedDeliveryDate: '2026-07-01',
      status: 'draft',
    });

    await expect(listLatePurchaseOrders({ clock, db: context.db })).resolves.toEqual({ items: [] });
  });
});
