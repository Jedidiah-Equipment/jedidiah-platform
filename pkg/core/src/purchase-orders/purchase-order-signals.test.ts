import type { Db } from '@pkg/db';
import { parts, purchaseOrderLines, purchaseOrders, supplier, user } from '@pkg/db';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { postReceipt } from '../inventory/receipt-service.js';
import { createTester } from '../test/create-tester.js';
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
  await db
    .insert(parts)
    .values([partRow({ code: 'L-100', id: PART_ID }), partRow({ code: 'L-200', id: OTHER_PART_ID })]);

  return {};
});

describe('listLatePurchaseOrders', () => {
  test('lists a sent order past its expected date with an open remainder', async ({ context }) => {
    await seedSentOrder(context.db, { expectedDeliveryDate: '2026-07-30', lines: [{ partId: PART_ID, quantity: 4 }] });

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
    const id = await seedSentOrder(context.db, {
      expectedDeliveryDate: '2026-07-30',
      lines: [
        { partId: PART_ID, quantity: 4 },
        { partId: OTHER_PART_ID, quantity: 2 },
      ],
    });
    await postReceipt({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { lengthMm: null, partId: PART_ID, purchaseOrderId: id, quantity: 4, unitCost: null },
    });

    await expect(listLatePurchaseOrders({ clock, db: context.db })).resolves.toMatchObject({
      items: [expect.objectContaining({ openLineCount: 1 })],
    });
  });

  test('drops an order once every line has arrived', async ({ context }) => {
    const id = await seedSentOrder(context.db, {
      expectedDeliveryDate: '2026-07-30',
      lines: [{ partId: PART_ID, quantity: 4 }],
    });
    await postReceipt({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { lengthMm: null, partId: PART_ID, purchaseOrderId: id, quantity: 4, unitCost: null },
    });

    await expect(listLatePurchaseOrders({ clock, db: context.db })).resolves.toEqual({ items: [] });
  });

  test('drops an order whose remainder was released by closing it short', async ({ context }) => {
    const id = await seedSentOrder(context.db, {
      expectedDeliveryDate: '2026-07-30',
      lines: [{ partId: PART_ID, quantity: 4 }],
    });
    await context.db
      .update(purchaseOrders)
      .set({ closedShortAt: new Date('2026-08-01T08:00:00.000Z') })
      .where(eq(purchaseOrders.id, id));

    await expect(listLatePurchaseOrders({ clock, db: context.db })).resolves.toEqual({ items: [] });
  });

  test('leaves an order due today, an undated order, and a draft alone', async ({ context }) => {
    await seedSentOrder(context.db, { expectedDeliveryDate: '2026-08-04', lines: [{ partId: PART_ID, quantity: 1 }] });
    await seedSentOrder(context.db, { expectedDeliveryDate: null, lines: [{ partId: PART_ID, quantity: 1 }] });
    await seedSentOrder(context.db, {
      expectedDeliveryDate: '2026-07-01',
      lines: [{ partId: PART_ID, quantity: 1 }],
      status: 'draft',
    });

    await expect(listLatePurchaseOrders({ clock, db: context.db })).resolves.toEqual({ items: [] });
  });
});

function partRow(overrides: Partial<typeof parts.$inferInsert>): typeof parts.$inferInsert {
  return {
    category: 'Pipe',
    code: 'L-100',
    description: 'Late Part',
    finish: 'Plain',
    id: PART_ID,
    name: 'Late Part',
    supplierCode: 'SUP-LATE',
    supplierId: SUPPLIER_ID,
    unitOfMeasure: 'piece',
    ...overrides,
  };
}

async function seedSentOrder(
  db: Db,
  {
    expectedDeliveryDate,
    lines,
    status = 'sent',
  }: {
    expectedDeliveryDate: string | null;
    lines: ReadonlyArray<{ partId: string; quantity: number }>;
    status?: 'draft' | 'sent';
  },
): Promise<string> {
  const [purchaseOrder] = await db
    .insert(purchaseOrders)
    .values({
      expectedDeliveryDate,
      sentAt: status === 'sent' ? new Date('2026-07-20T08:00:00.000Z') : null,
      status,
      supplierId: SUPPLIER_ID,
    })
    .returning();
  if (!purchaseOrder) throw new Error('Purchase Order insert did not return a row');

  await db
    .insert(purchaseOrderLines)
    .values(lines.map((line) => ({ ...line, purchaseOrderId: purchaseOrder.id, unitPrice: 10 })));

  return purchaseOrder.id;
}
