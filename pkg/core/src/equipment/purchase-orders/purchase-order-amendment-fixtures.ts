import { type Db, user } from '@pkg/db';
import { parts, supplier } from '@pkg/db/equipment';
import type { PurchaseOrder } from '@pkg/schema/equipment';
import { InMemoryStorageAdapter } from '../../storage/in-memory-storage-adapter.js';
import { postReceipt } from '../inventory/receipt-service.js';
import { createTester } from '../test/create-tester.js';
import {
  approvePurchaseOrder,
  createPurchaseOrder,
  markPurchaseOrderSent,
  savePurchaseOrderDraft,
} from './purchase-order-service.js';

/**
 * One sent order on one Supplier, with a Part of each shape an amendment or a return has to cope
 * with. Shared by the amendment, return-to-supplier and credit-note suites so the three cannot
 * drift into testing different worlds — they are three views of the same order's afterlife.
 */

export const ACTOR_ID = 'po-amendment-test-user';
export const SUPPLIER_ID = '00000000-0000-4000-8000-000000000901';
export const OTHER_SUPPLIER_ID = '00000000-0000-4000-8000-000000000902';
export const PIECE_PART_ID = '00000000-0000-4000-8000-000000000911';
export const SPARE_PART_ID = '00000000-0000-4000-8000-000000000912';
export const LINEAR_PART_ID = '00000000-0000-4000-8000-000000000913';
export const OTHER_SUPPLIER_PART_ID = '00000000-0000-4000-8000-000000000914';

export type AmendmentTestContext = { db: Db; storage: InMemoryStorageAdapter };

export const test = createTester<AmendmentTestContext>(async ({ db }) => {
  await db.insert(user).values({
    createdAt: new Date(),
    email: 'po-amendment@example.com',
    emailVerified: true,
    id: ACTOR_ID,
    name: 'Amendment Tester',
    role: 'admin',
    updatedAt: new Date(),
  });
  await db.insert(supplier).values([
    { companyName: 'Acme Supplies', id: SUPPLIER_ID },
    { companyName: 'Other Supplies', id: OTHER_SUPPLIER_ID },
  ]);
  await db
    .insert(parts)
    .values([
      partRow({ code: 'P-100', id: PIECE_PART_ID }),
      partRow({ code: 'P-110', id: SPARE_PART_ID }),
      partRow({ code: 'P-200', id: LINEAR_PART_ID, standardPurchaseLengthMm: 6_000, unitOfMeasure: 'mm' }),
      partRow({ code: 'P-900', id: OTHER_SUPPLIER_PART_ID, supplierId: OTHER_SUPPLIER_ID }),
    ]);

  return { db, storage: new InMemoryStorageAdapter() };
});

export async function sendOrder(
  context: AmendmentTestContext,
  lines: Array<{ partId: string; quantity: number; unitPrice: number }>,
): Promise<PurchaseOrder> {
  const purchaseOrder = await createPurchaseOrder({
    actorUserId: ACTOR_ID,
    db: context.db,
    input: { expectedDeliveryDate: null, supplierId: SUPPLIER_ID },
  });
  await savePurchaseOrderDraft({
    actorUserId: ACTOR_ID,
    db: context.db,
    input: { expectedDeliveryDate: null, id: purchaseOrder.id, jobIds: [], lines, supplierId: SUPPLIER_ID },
  });

  // Sending now asserts an admin signed the draft off first; every order's afterlife starts here.
  await approvePurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id });

  return markPurchaseOrderSent({
    actorUserId: ACTOR_ID,
    db: context.db,
    id: purchaseOrder.id,
    pdfRenderer: async () => pdfBytes(),
    storage: context.storage,
  });
}

export async function receive(
  context: AmendmentTestContext,
  purchaseOrderId: string,
  partId: string,
  quantity: number,
  unitCost: number | null = null,
) {
  return postReceipt({
    actorUserId: ACTOR_ID,
    db: context.db,
    input: { lengthMm: null, partId, purchaseOrderId, quantity, unitCost },
  });
}

export function pdfBytes(): Uint8Array {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
}

/** The renderer every amendment suite passes; it only has to produce something PDF-shaped. */
export const renderStubPdf = async () => pdfBytes();

function partRow(overrides: Partial<typeof parts.$inferInsert>): typeof parts.$inferInsert {
  return {
    category: 'Pipe',
    code: 'P-100',
    description: 'Test Part',
    finish: 'Plain',
    id: PIECE_PART_ID,
    name: 'Test Part',
    standardPurchaseLengthMm: null,
    supplierCode: 'SUP-100',
    supplierId: SUPPLIER_ID,
    unitOfMeasure: 'piece',
    ...overrides,
  };
}
