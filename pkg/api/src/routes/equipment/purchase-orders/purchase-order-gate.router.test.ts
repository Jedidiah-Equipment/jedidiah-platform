import { randomUUID } from 'node:crypto';
import { InMemoryStorageAdapter } from '@pkg/core';
import {
  PurchaseOrderActionRefusedError,
  renderPurchaseOrderPreview,
  uploadCreditNote,
  uploadSupplierInvoice,
} from '@pkg/core/equipment';
import { type Db, user } from '@pkg/db';
import { parts, supplier } from '@pkg/db/equipment';
import type { PurchaseOrderActionName, PurchaseOrderActionVerdict } from '@pkg/schema/equipment';
import { TRPCError } from '@trpc/server';
import { describe, expect } from 'vitest';
import { seedPartCategory } from '../../../equipment/test/part-category-fixtures.js';
import { type AppRouterCaller, createTester } from '../../../test/create-tester.js';
import { getTRPCPublicMetadata } from '../../../trpc/errors.js';

const SUPPLIER_ID = '00000000-0000-4000-8000-000000000501';
const PART_ID = '00000000-0000-4000-8000-000000000502';
const ACTOR_ID = 'test-user-id';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    createdAt: new Date(),
    email: 'test@example.com',
    emailVerified: true,
    id: ACTOR_ID,
    name: 'Test User',
    role: 'admin',
    updatedAt: new Date(),
  });
  await db.insert(supplier).values({ companyName: 'Gate Supplies', id: SUPPLIER_ID });
  const categoryId = await seedPartCategory(db, 'Fasteners');
  await db.insert(parts).values({
    categoryId,
    code: 'PO-GATE-PART',
    description: 'Gate test Part',
    finish: 'Plain',
    id: PART_ID,
    name: 'Gate Part',
    supplierCode: 'GATE-1',
    supplierId: SUPPLIER_ID,
    unitOfMeasure: 'piece',
  });
  return { db };
});

type Context = { db: Db };
type Order = { id: string; customLineId: string };

const states = [
  'draft',
  'approved',
  'sent',
  'sent with a receipt',
  'closed short',
  'fully received',
  'cancelled',
] as const;
type State = (typeof states)[number];

/** A fresh order in the given state, carrying one Part Line of four and one Custom Line of two. */
async function orderIn(admin: AppRouterCaller, state: State): Promise<Order> {
  const { id } = await admin.purchaseOrders.create({ supplierId: SUPPLIER_ID });
  const customLineId = randomUUID();
  await admin.purchaseOrders.saveDraft(draftOf(id, customLineId));
  const order = { id, customLineId };
  if (state === 'draft') return order;
  if (state === 'cancelled') {
    await admin.purchaseOrders.cancel({ id });
    return order;
  }
  await admin.purchaseOrders.approve({ id });
  if (state === 'approved') return order;
  await admin.purchaseOrders.markSent({ id });
  if (state === 'sent') return order;
  await admin.purchaseOrders.receive(receipt(id, state === 'fully received' ? 4 : 1));
  if (state === 'sent with a receipt') return order;
  if (state === 'closed short') {
    await admin.purchaseOrders.closeShort({ id });
    return order;
  }
  await admin.purchaseOrders.postArrival({ lineId: customLineId, note: null, purchaseOrderId: id, quantity: 2 });
  return order;
}

const draftOf = (id: string, customLineId: string) => ({
  expectedDeliveryDate: null,
  id,
  jobIds: [],
  lines: [
    { kind: 'part' as const, partId: PART_ID, quantity: 4, unitPrice: 150 },
    {
      description: 'Packing tape',
      id: customLineId,
      kind: 'custom' as const,
      quantity: 2,
      supplierCode: null,
      unit: 'box',
      unitPrice: 80,
    },
  ],
  supplierId: SUPPLIER_ID,
});

const receipt = (purchaseOrderId: string, quantity: number) => ({
  lengthMm: null,
  partId: PART_ID,
  purchaseOrderId,
  quantity,
  unitCost: null,
});

const pdf = () => new TextEncoder().encode('%PDF-1.4\n%%EOF\n');

/** One write per Purchase Order Action, asked for the way a surface asks. */
const writes: Record<
  PurchaseOrderActionName,
  (admin: AppRouterCaller, order: Order, context: Context) => Promise<unknown>
> = {
  edit: (admin, order) => admin.purchaseOrders.saveDraft(draftOf(order.id, order.customLineId)),
  approve: (admin, order) => admin.purchaseOrders.approve({ id: order.id }),
  revertToDraft: (admin, order) => admin.purchaseOrders.revertToDraft({ id: order.id }),
  preview: (_admin, order, { db }) =>
    renderPurchaseOrderPreview({ db, id: order.id, pdfRenderer: async () => new Uint8Array([1]) }),
  send: (admin, order) => admin.purchaseOrders.markSent({ id: order.id }),
  amend: async (admin, order) => {
    const { lines } = await admin.purchaseOrders.get({ id: order.id });
    const partLine = lines.find((line) => line.kind === 'part');
    if (!partLine) throw new Error('Expected the Part Line');
    return admin.purchaseOrders.amendQuantity({ id: order.id, lineId: partLine.id, note: 'Agreed', quantity: 5 });
  },
  receive: (admin, order) => admin.purchaseOrders.receive(receipt(order.id, 1)),
  returnToSupplier: (admin, order) =>
    admin.purchaseOrders.returnToSupplier({
      lengthMm: null,
      note: null,
      partId: PART_ID,
      purchaseOrderId: order.id,
      quantity: 1,
      reason: 'defective',
    }),
  cancel: (admin, order) => admin.purchaseOrders.cancel({ id: order.id }),
  closeShort: (admin, order) => admin.purchaseOrders.closeShort({ id: order.id }),
  // Invoice and credit note arrive as multipart uploads; the route hands over to these same calls.
  fileDocuments: async (_admin, order, { db }) => {
    const storage = new InMemoryStorageAdapter();
    await uploadSupplierInvoice({
      actorUserId: ACTOR_ID,
      bytes: pdf(),
      db,
      extract: async () => {
        throw new Error('No model in this test');
      },
      filename: `INV-${order.id}.pdf`,
      input: { purchaseOrderId: order.id },
      storage,
    });
    return uploadCreditNote({
      actorUserId: ACTOR_ID,
      bytes: pdf(),
      db,
      filename: `CN-${order.id}.pdf`,
      input: { purchaseOrderId: order.id, stockMovementIds: [randomUUID()] },
      storage,
    });
  },
};

/** A Custom Line arrives through its own write, judged on the receive verdict. */
const arrive = (admin: AppRouterCaller, order: Order) =>
  admin.purchaseOrders.postArrival({ lineId: order.customLineId, note: null, purchaseOrderId: order.id, quantity: 1 });

/** The Purchase Order Action a write was refused under, if the order's own state refused it. */
function refusalOf(error: unknown): { action: string; reason: string } | undefined {
  if (error instanceof PurchaseOrderActionRefusedError) return { action: error.action, reason: error.reason };
  if (error instanceof TRPCError) return getTRPCPublicMetadata(error) as { action: string; reason: string } | undefined;
  return undefined;
}

async function settle(write: Promise<unknown>) {
  try {
    await write;
    return null;
  } catch (error) {
    return error;
  }
}

function expectAgreement(
  action: PurchaseOrderActionName,
  verdict: PurchaseOrderActionVerdict,
  error: unknown,
  label: string,
) {
  const refused = refusalOf(error);
  if (verdict.allowed) {
    // Allowed means the order's state did not refuse it; an input this fixture cannot satisfy (a credit
    // note naming no real return) may still fail on its own terms.
    expect(refused, `${label}: ${String(error)}`).toBeUndefined();
    expect(error instanceof TRPCError && error.code === 'FORBIDDEN', label).toBe(false);
    return;
  }
  expect(refused, label).toEqual({ action, reason: verdict.reason });
}

describe('Purchase Order Actions served on the order agree with what every write does', () => {
  test.for(states)('an order that is %s', async (state, { context }) => {
    const admin = context.createCaller();
    const { actions } = await admin.purchaseOrders.get({ id: (await orderIn(admin, state)).id });
    for (const [action, write] of Object.entries(writes) as [
      PurchaseOrderActionName,
      (typeof writes)[PurchaseOrderActionName],
    ][])
      expectAgreement(
        action,
        actions[action],
        await settle(write(admin, await orderIn(admin, state), context)),
        `${state} · ${action}`,
      );
    expectAgreement(
      'receive',
      actions.receive,
      await settle(arrive(admin, await orderIn(admin, state))),
      `${state} · arrive`,
    );
  });
});
