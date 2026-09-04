import { auditEvents, type Db, user } from '@pkg/db';
import { customers, documents, jobs, parts, purchaseOrders, quotes, supplier } from '@pkg/db/equipment';
import { DateOnlyIso } from '@pkg/schema';
import type { PurchaseOrderPdfModel } from '@pkg/schema/equipment';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, vi } from 'vitest';
import { InMemoryStorageAdapter } from '../../storage/in-memory-storage-adapter.js';
import { postReceipt } from '../inventory/receipt-service.js';
import { postReturnToSupplier } from '../inventory/return-to-supplier-service.js';
import { getJobDocuments } from '../jobs/job-read-service.js';
import { updatePart } from '../parts/part-service.js';
import { removeSupplier } from '../suppliers/supplier-service.js';
import { createTester } from '../test/create-tester.js';
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrderShort,
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  markPurchaseOrderSent,
  renderPurchaseOrderPreview,
  revertPurchaseOrderToDraft,
  savePurchaseOrderDraft,
} from './purchase-order-service.js';

const ACTOR_ID = 'po-test-user';
const SUPPLIER_A_ID = '00000000-0000-4000-8000-000000000101';
const SUPPLIER_B_ID = '00000000-0000-4000-8000-000000000102';
const PIECE_PART_ID = '00000000-0000-4000-8000-000000000201';
const LINEAR_PART_ID = '00000000-0000-4000-8000-000000000202';
const OTHER_PART_ID = '00000000-0000-4000-8000-000000000203';
const BUILT_PART_ID = '00000000-0000-4000-8000-000000000204';

function draftInput(id: string, lines: Array<{ partId: string; quantity: number; unitPrice: number }>) {
  return { expectedDeliveryDate: null, id, jobIds: [], lines, supplierId: SUPPLIER_A_ID };
}

const test = createTester(async ({ db }) => {
  await seedCatalog(db);
  const jobIds = await seedJobs(db);

  return { db, jobIds, storage: new InMemoryStorageAdapter() };
});

describe('Purchase Order draft lifecycle', () => {
  test('creates a draft, replaces its lines and Job links, and audits header changes', async ({ context }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });

    expect(purchaseOrder).toMatchObject({ code: 'PO-00001', jobs: [], lines: [], status: 'draft' });
    await expect(
      listPurchaseOrders({
        db: context.db,
        input: { cursor: 0, limit: 20, search: 'acme', sortBy: 'createdAt', sortDirection: 'desc' },
      }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ id: purchaseOrder.id })], total: 1 });
    await expect(removeSupplier({ actorUserId: ACTOR_ID, db: context.db, id: SUPPLIER_A_ID })).rejects.toMatchObject({
      code: 'supplier.has_draft_purchase_orders',
    });

    const updated = await savePurchaseOrderDraft({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        expectedDeliveryDate: DateOnlyIso.parse('2026-08-20'),
        id: purchaseOrder.id,
        jobIds: context.jobIds,
        lines: [
          { partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 },
          { partId: LINEAR_PART_ID, quantity: 2, unitPrice: 900 },
        ],
        supplierId: SUPPLIER_A_ID,
      },
    });

    expect(updated).toMatchObject({
      expectedDeliveryDate: '2026-08-20',
      jobs: [{ id: context.jobIds[0] }, { id: context.jobIds[1] }],
      lines: [
        { partId: PIECE_PART_ID, quantity: 4, standardPurchaseLengthMm: null, unitPrice: 125.5 },
        { partId: LINEAR_PART_ID, quantity: 2, standardPurchaseLengthMm: 6_000, unitPrice: 900 },
      ],
    });

    // One save is one audit event: the header change and both child collections together.
    const events = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);
    expect(events).toEqual([
      expect.objectContaining({ action: 'created', entityId: purchaseOrder.id, entityType: 'purchase_order' }),
      expect.objectContaining({
        action: 'updated',
        changes: expect.objectContaining({
          expectedDeliveryDate: { from: null, to: '2026-08-20' },
          [`job:${updated.jobs[0]?.code}`]: expect.objectContaining({ from: null }),
          'line:P-100': expect.objectContaining({ from: null }),
        }),
        entityId: purchaseOrder.id,
        entityType: 'purchase_order',
      }),
    ]);
  });

  test('rejects a line from another supplier and a fractional piece count', async ({ context }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });

    await expect(
      savePurchaseOrderDraft({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: draftInput(purchaseOrder.id, [{ partId: OTHER_PART_ID, quantity: 1, unitPrice: 10 }]),
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.part_supplier_mismatch' });
    await expect(
      savePurchaseOrderDraft({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 1.5, unitPrice: 10 }]),
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.invalid_quantity' });
  });

  test('prevents a Part supplier change from breaking an existing Purchase Order', async ({ context }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });
    await savePurchaseOrderDraft({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 1, unitPrice: 10 }]),
    });

    await expect(
      updatePart({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          averageUtilizationPercent: null,
          category: 'Pipe',
          code: 'P-100',
          description: 'Test Part',
          drawingCode: null,
          finish: 'Plain',
          id: PIECE_PART_ID,
          isInternallyFabricated: false,
          minimumStock: null,
          name: 'Test Part',
          standardPurchaseLengthMm: null,
          stockTrackingMode: 'perpetual',
          storageLocation: null,
          supplierCode: 'SUP-100',
          supplierId: SUPPLIER_B_ID,
          unitOfMeasure: 'piece',
        },
      }),
    ).rejects.toMatchObject({ code: 'part.supplier_locked_by_purchase_order' });

    await cancelPurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id });
    await expect(
      updatePart({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          averageUtilizationPercent: null,
          category: 'Pipe',
          code: 'P-100',
          description: 'Test Part',
          drawingCode: null,
          finish: 'Plain',
          id: PIECE_PART_ID,
          isInternallyFabricated: false,
          minimumStock: null,
          name: 'Test Part',
          standardPurchaseLengthMm: null,
          stockTrackingMode: 'perpetual',
          storageLocation: null,
          supplierCode: 'SUP-100',
          supplierId: SUPPLIER_B_ID,
          unitOfMeasure: 'piece',
        },
      }),
    ).resolves.toMatchObject({ supplierId: SUPPLIER_B_ID });
  });
});

describe('Purchase Order line parts', () => {
  test('refuses a built Part by name rather than as a supplier mismatch', async ({ context }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });

    // A built Part has no Supplier, so a generic mismatch would send the buyer looking for the
    // wrong Supplier instead of saying the Part is not purchasable at all.
    await expect(
      savePurchaseOrderDraft({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: draftInput(purchaseOrder.id, [{ partId: BUILT_PART_ID, quantity: 2, unitPrice: 100 }]),
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.part_not_purchasable' });

    await expect(
      savePurchaseOrderDraft({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: draftInput(purchaseOrder.id, [{ partId: OTHER_PART_ID, quantity: 2, unitPrice: 100 }]),
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.part_supplier_mismatch' });
  });
});

describe('Purchase Order send and cancel', () => {
  test('renders an inline preview for a saved draft without mutating its lifecycle', async ({ context }) => {
    const modifierId = 'po-preview-modifier';
    await seedTestUser(context.db, { id: modifierId, name: 'Preview Modifier' });
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: DateOnlyIso.parse('2026-08-20'), supplierId: SUPPLIER_A_ID },
    });
    await savePurchaseOrderDraft({
      actorUserId: modifierId,
      db: context.db,
      input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 }]),
    });
    const render = vi.fn(async (_input: { document: PurchaseOrderPdfModel; filename: string }) => pdfBytes());

    const preview = await renderPurchaseOrderPreview({ db: context.db, id: purchaseOrder.id, pdfRenderer: render });

    expect(preview).toEqual({ bytes: pdfBytes(), filename: 'PO-00001.pdf' });
    expect(render).toHaveBeenCalledWith({
      document: expect.objectContaining({
        code: 'PO-00001',
        lastModified: { actorName: 'Preview Modifier', occurredAt: expect.any(String) },
        lines: [expect.objectContaining({ partCode: 'P-100', quantity: 4, unitPrice: 125.5 })],
      }),
      filename: 'PO-00001.pdf',
    });
    await expect(getPurchaseOrder({ db: context.db, id: purchaseOrder.id })).resolves.toMatchObject({
      status: 'draft',
    });
  });

  test('names the last editor of this order, not the newest edit anywhere', async ({ context }) => {
    const ourEditorId = 'po-our-editor';
    const otherEditorId = 'po-other-editor';
    await seedTestUser(context.db, { id: ourEditorId, name: 'Our Editor' });
    await seedTestUser(context.db, { id: otherEditorId, name: 'Other Editor' });
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });
    await savePurchaseOrderDraft({
      actorUserId: ourEditorId,
      db: context.db,
      input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 }]),
    });
    // A second order edited afterwards leaves the newest audit row in the table. The footer names
    // who touched *this* order, so that row has to stay out of the lookup entirely.
    const otherOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });
    await savePurchaseOrderDraft({
      actorUserId: otherEditorId,
      db: context.db,
      input: draftInput(otherOrder.id, [{ partId: PIECE_PART_ID, quantity: 1, unitPrice: 10 }]),
    });
    const render = vi.fn(async (_input: { document: PurchaseOrderPdfModel; filename: string }) => pdfBytes());

    await renderPurchaseOrderPreview({ db: context.db, id: purchaseOrder.id, pdfRenderer: render });

    expect(render).toHaveBeenCalledWith({
      document: expect.objectContaining({
        lastModified: { actorName: 'Our Editor', occurredAt: expect.any(String) },
      }),
      filename: 'PO-00001.pdf',
    });
  });

  test('passes a deleted last modifier to the PDF as System', async ({ context }) => {
    const deletedActorId = 'po-deleted-modifier';
    await seedTestUser(context.db, { id: deletedActorId, name: 'Deleted Modifier' });
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });
    await savePurchaseOrderDraft({
      actorUserId: deletedActorId,
      db: context.db,
      input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 1, unitPrice: 125.5 }]),
    });
    await context.db.delete(user).where(eq(user.id, deletedActorId));
    const render = vi.fn(async (_input: { document: PurchaseOrderPdfModel; filename: string }) => pdfBytes());

    await renderPurchaseOrderPreview({ db: context.db, id: purchaseOrder.id, pdfRenderer: render });

    expect(render).toHaveBeenCalledWith({
      document: expect.objectContaining({
        lastModified: { actorName: null, occurredAt: expect.any(String) },
      }),
      filename: 'PO-00001.pdf',
    });
  });

  test('stores one as-sent PDF and projects it onto every linked Job', async ({ context }) => {
    const draftEditorId = 'po-draft-editor';
    await seedTestUser(context.db, { id: draftEditorId, name: 'Draft Editor' });
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: DateOnlyIso.parse('2026-08-20'), supplierId: SUPPLIER_A_ID },
    });
    await savePurchaseOrderDraft({
      actorUserId: draftEditorId,
      db: context.db,
      input: {
        ...draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 }]),
        expectedDeliveryDate: DateOnlyIso.parse('2026-08-20'),
        jobIds: context.jobIds,
      },
    });
    const render = vi.fn(async (_input: { document: PurchaseOrderPdfModel; filename: string }) => pdfBytes());
    // A different actor signs it off, withdraws it, and signs it off again. None of those touch what
    // the Supplier is looking at, so the footer still has to name the Draft Editor who wrote it.
    await approvePurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id });
    await revertPurchaseOrderToDraft({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id });
    await approvePurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id });

    const sent = await markPurchaseOrderSent({
      actorUserId: ACTOR_ID,
      db: context.db,
      id: purchaseOrder.id,
      pdfRenderer: render,
      storage: context.storage,
    });

    expect(sent).toMatchObject({ documentId: expect.any(String), sentAt: expect.any(String), status: 'sent' });
    expect(render).toHaveBeenCalledWith({
      document: expect.objectContaining({
        code: 'PO-00001',
        expectedDeliveryDate: '2026-08-20',
        jobCodes: expect.arrayContaining([expect.stringMatching(/^JOB-/), expect.stringMatching(/^JOB-/)]),
        lastModified: { actorName: 'Draft Editor', occurredAt: expect.any(String) },
        lines: [expect.objectContaining({ partCode: 'P-100', quantity: 4, unitPrice: 125.5 })],
        supplier: expect.objectContaining({ companyName: 'Acme Supplies' }),
      }),
      filename: 'PO-00001.pdf',
    });

    for (const jobId of context.jobIds) {
      await expect(getJobDocuments({ db: context.db, jobId })).resolves.toEqual([
        expect.objectContaining({ id: sent.documentId, ownerType: 'purchase_order', purchaseOrderId: sent.id }),
      ]);
    }
    await expect(context.db.select().from(documents)).resolves.toHaveLength(1);

    await expect(
      savePurchaseOrderDraft({ actorUserId: ACTOR_ID, db: context.db, input: draftInput(sent.id, []) }),
    ).rejects.toMatchObject({ code: 'purchase_order.not_draft' });
  });

  test('refuses to approve an empty draft and allows a zero-receipt cancellation', async ({ context }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });

    await expect(
      approvePurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id }),
    ).rejects.toMatchObject({ code: 'purchase_order.empty' });

    await expect(
      cancelPurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id }),
    ).resolves.toMatchObject({ approvedAt: null, sentAt: null, status: 'cancelled' });
  });

  test('refuses to send a draft whose line still carries the not-priced-yet zero', async ({ context }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });
    await savePurchaseOrderDraft({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 2, unitPrice: 0 }]),
    });
    await approvePurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id });

    // The message names the Part, which is the only thing that tells the buyer where to go.
    await expect(
      markPurchaseOrderSent({
        actorUserId: ACTOR_ID,
        db: context.db,
        id: purchaseOrder.id,
        pdfRenderer: async () => pdfBytes(),
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.line_not_priced', message: expect.stringContaining('P-100') });
    expect(context.storage.objects.size).toBe(0);
  });

  test('removes the uploaded PDF when the outer send transaction rolls back', async ({ context }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });
    await savePurchaseOrderDraft({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 1, unitPrice: 10 }]),
    });
    await approvePurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id });
    await context.db.execute(sql`
      create function fail_purchase_order_send() returns trigger language plpgsql as $$
      begin
        if new.status = 'sent' then raise exception 'forced send failure'; end if;
        return new;
      end
      $$
    `);
    await context.db.execute(sql`
      create trigger fail_purchase_order_send
      before update on ${purchaseOrders}
      for each row execute function fail_purchase_order_send()
    `);

    await expect(
      markPurchaseOrderSent({
        actorUserId: ACTOR_ID,
        db: context.db,
        id: purchaseOrder.id,
        pdfRenderer: async () => pdfBytes(),
        storage: context.storage,
      }),
    ).rejects.toThrow();
    expect(context.storage.objects.size).toBe(0);
    await expect(context.db.select().from(documents)).resolves.toHaveLength(0);
    await expect(getPurchaseOrder({ db: context.db, id: purchaseOrder.id })).resolves.toMatchObject({
      status: 'approved',
    });
  });
});

describe('Purchase Order approval', () => {
  test('signs a draft off, locks it, and lets it go to the Supplier', async ({ context }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });
    await savePurchaseOrderDraft({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 2, unitPrice: 50 }]),
    });

    const approved = await approvePurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id });

    expect(approved).toMatchObject({
      approvedAt: expect.any(String),
      derivedStatus: 'approved',
      sentAt: null,
      status: 'approved',
    });
    // Approval locks the order the way sending does, so the draft aggregate can no longer be saved.
    await expect(
      savePurchaseOrderDraft({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 3, unitPrice: 50 }]),
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.not_draft' });
    // Locked is not gone: the order still has not reached the Supplier, so removing that Supplier
    // would strand it exactly as it would a draft.
    await expect(removeSupplier({ actorUserId: ACTOR_ID, db: context.db, id: SUPPLIER_A_ID })).rejects.toMatchObject({
      code: 'supplier.has_draft_purchase_orders',
    });

    const sent = await markPurchaseOrderSent({
      actorUserId: ACTOR_ID,
      db: context.db,
      id: purchaseOrder.id,
      pdfRenderer: async () => pdfBytes(),
      storage: context.storage,
    });

    // Sending keeps the sign-off standing, and the badge still names the highest level reached.
    expect(sent).toMatchObject({
      approvedAt: approved.approvedAt,
      derivedStatus: 'approved',
      sentAt: expect.any(String),
      status: 'sent',
    });
  });

  test('refuses to send a draft nobody has approved', async ({ context }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });
    await savePurchaseOrderDraft({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 2, unitPrice: 50 }]),
    });

    await expect(
      markPurchaseOrderSent({
        actorUserId: ACTOR_ID,
        db: context.db,
        id: purchaseOrder.id,
        pdfRenderer: async () => pdfBytes(),
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'purchase_order.not_approved' });
    expect(context.storage.objects.size).toBe(0);
  });

  test('withdraws an approval back to an editable draft, and records both moves in the audit trail', async ({
    context,
  }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });
    await savePurchaseOrderDraft({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 2, unitPrice: 50 }]),
    });
    const approved = await approvePurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id });

    const reverted = await revertPurchaseOrderToDraft({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id });

    expect(reverted).toMatchObject({ approvedAt: null, derivedStatus: 'draft', status: 'draft' });
    await expect(
      savePurchaseOrderDraft({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 3, unitPrice: 50 }]),
      }),
    ).resolves.toMatchObject({ status: 'draft' });
    // The withdrawn sign-off survives as history even though the timestamp is gone.
    await expect(
      context.db.select().from(auditEvents).where(eq(auditEvents.entityId, purchaseOrder.id)),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changes: expect.objectContaining({
            approvedAt: { from: null, to: approved.approvedAt },
            status: { from: 'draft', to: 'approved' },
          }),
        }),
        expect.objectContaining({
          changes: expect.objectContaining({
            approvedAt: { from: approved.approvedAt, to: null },
            status: { from: 'approved', to: 'draft' },
          }),
        }),
      ]),
    );
  });

  test('cancels an approved order, discarding the sign-off without spending a permission for it', async ({
    context,
  }) => {
    const purchaseOrder = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });
    await savePurchaseOrderDraft({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: draftInput(purchaseOrder.id, [{ partId: PIECE_PART_ID, quantity: 2, unitPrice: 50 }]),
    });
    await approvePurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id });

    await expect(
      cancelPurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id }),
    ).resolves.toMatchObject({ derivedStatus: 'cancelled', sentAt: null, status: 'cancelled' });
  });
});

describe('Purchase Order receiving progress', () => {
  test('projects the stored status through cumulative receipts on every line', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [
      { partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 },
      { partId: LINEAR_PART_ID, quantity: 2, unitPrice: 900 },
    ]);

    // Nothing has arrived yet, so the badge is still the level the order reached before it went out.
    expect(purchaseOrder).toMatchObject({
      closedShortAt: null,
      derivedStatus: 'approved',
      lines: [{ receivedQuantity: 0 }, { receivedQuantity: 0 }],
    });

    await receive(context, purchaseOrder.id, PIECE_PART_ID, 3);
    await expect(getPurchaseOrder({ db: context.db, id: purchaseOrder.id })).resolves.toMatchObject({
      derivedStatus: 'partially-received',
      lines: [{ partId: PIECE_PART_ID, receivedQuantity: 3 }, { receivedQuantity: 0 }],
    });

    await receive(context, purchaseOrder.id, PIECE_PART_ID, 1);
    await receive(context, purchaseOrder.id, LINEAR_PART_ID, 2);
    await expect(getPurchaseOrder({ db: context.db, id: purchaseOrder.id })).resolves.toMatchObject({
      derivedStatus: 'received',
      lines: [{ receivedQuantity: 4 }, { receivedQuantity: 2 }],
    });

    // The list read projects the same derived state, so a receiver never sees two different answers.
    await expect(
      listPurchaseOrders({
        db: context.db,
        input: { cursor: 0, limit: 20, search: '', sortBy: 'createdAt', sortDirection: 'desc' },
      }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ derivedStatus: 'received' })] });
  });

  test('closes a part-delivered order short and stops cancelling it once stock has arrived', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 }]);

    await expect(
      closePurchaseOrderShort({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id }),
    ).rejects.toMatchObject({ code: 'purchase_order.no_receipts' });

    await receive(context, purchaseOrder.id, PIECE_PART_ID, 1);

    // The cancel guard is no longer trivially satisfied: a real receipt now blocks it.
    await expect(
      cancelPurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id }),
    ).rejects.toMatchObject({ code: 'purchase_order.has_receipts' });

    const closed = await closePurchaseOrderShort({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id });

    expect(closed).toMatchObject({ closedShortAt: expect.any(String), derivedStatus: 'closed-short', status: 'sent' });
    await expect(
      closePurchaseOrderShort({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id }),
    ).rejects.toMatchObject({ code: 'purchase_order.already_closed_short' });
    // The released remainder stays released: a later delivery cannot make the assertion a lie.
    await expect(receive(context, purchaseOrder.id, PIECE_PART_ID, 1)).rejects.toMatchObject({
      code: 'purchase_order.closed_short',
    });
    await expect(
      context.db.select().from(auditEvents).where(eq(auditEvents.entityId, purchaseOrder.id)),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'updated',
          changes: expect.objectContaining({ closedShortAt: { from: null, to: closed.closedShortAt } }),
        }),
      ]),
    );
  });

  test('refuses to close a draft or a cancelled order short', async ({ context }) => {
    const draft = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
    });

    await expect(
      closePurchaseOrderShort({ actorUserId: ACTOR_ID, db: context.db, id: draft.id }),
    ).rejects.toMatchObject({ code: 'purchase_order.not_sent' });

    await cancelPurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: draft.id });
    await expect(
      closePurchaseOrderShort({ actorUserId: ACTOR_ID, db: context.db, id: draft.id }),
    ).rejects.toMatchObject({ code: 'purchase_order.not_sent' });
  });

  test('closes an order short after everything it took in went back as replacement-owed', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 125.5 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 2);
    await postReturnToSupplier({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        lengthMm: null,
        note: null,
        partId: PIECE_PART_ID,
        purchaseOrderId: purchaseOrder.id,
        quantity: 2,
        reason: 'defective',
      },
    });

    // Netting is right about what is owed — all ten again — so the order reads as freshly sent.
    // The payload says which way out is open before either is attempted, from the same derivation
    // the two gates below assert on, so no surface can offer the one that would be refused.
    await expect(getPurchaseOrder({ db: context.db, id: purchaseOrder.id })).resolves.toMatchObject({
      actions: { cancel: { allowed: false, reason: 'has-movements' }, closeShort: { allowed: true } },
      derivedStatus: 'approved',
      lines: [{ receivedQuantity: 0 }],
    });
    // Cancel stays shut: the ledger rows are real history and cancelling would disown them.
    await expect(
      cancelPurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id }),
    ).rejects.toMatchObject({ code: 'purchase_order.has_receipts' });

    // So Close Short has to be the way out, or the order is stuck counting toward On Order forever.
    await expect(
      closePurchaseOrderShort({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id }),
    ).resolves.toMatchObject({ closedShortAt: expect.any(String), derivedStatus: 'closed-short', status: 'sent' });
  });

  test('refuses to close a fully received order short — there is no remainder to release', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 4, unitPrice: 125.5 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 4);

    await expect(
      closePurchaseOrderShort({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id }),
    ).rejects.toMatchObject({ code: 'purchase_order.fully_received' });
  });
});

async function sendOrder(
  context: { db: Db; storage: InMemoryStorageAdapter },
  lines: Array<{ partId: string; quantity: number; unitPrice: number }>,
) {
  const purchaseOrder = await createPurchaseOrder({
    actorUserId: ACTOR_ID,
    db: context.db,
    input: { expectedDeliveryDate: null, supplierId: SUPPLIER_A_ID },
  });
  await savePurchaseOrderDraft({
    actorUserId: ACTOR_ID,
    db: context.db,
    input: draftInput(purchaseOrder.id, lines),
  });
  // Sending asserts an admin signed the draft off first, so every sent-order fixture goes through it.
  await approvePurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: purchaseOrder.id });

  return markPurchaseOrderSent({
    actorUserId: ACTOR_ID,
    db: context.db,
    id: purchaseOrder.id,
    pdfRenderer: async () => pdfBytes(),
    storage: context.storage,
  });
}

async function receive(context: { db: Db }, purchaseOrderId: string, partId: string, quantity: number) {
  return postReceipt({
    actorUserId: ACTOR_ID,
    db: context.db,
    input: { lengthMm: null, partId, purchaseOrderId, quantity, unitCost: null },
  });
}

async function seedCatalog(db: Db): Promise<void> {
  await db.insert(user).values({
    createdAt: new Date(),
    email: 'po-test@example.com',
    emailVerified: true,
    id: ACTOR_ID,
    name: 'PO Test User',
    role: 'admin',
    updatedAt: new Date(),
  });
  await db.insert(supplier).values([
    { companyName: 'Acme Supplies', id: SUPPLIER_A_ID },
    { companyName: 'Other Supplies', id: SUPPLIER_B_ID },
  ]);
  await db.insert(parts).values([
    partRow({ code: 'P-100', id: PIECE_PART_ID, supplierId: SUPPLIER_A_ID }),
    partRow({
      code: 'P-200',
      id: LINEAR_PART_ID,
      standardPurchaseLengthMm: 6_000,
      supplierId: SUPPLIER_A_ID,
      unitOfMeasure: 'mm',
    }),
    partRow({ code: 'P-300', id: OTHER_PART_ID, supplierId: SUPPLIER_B_ID }),
    // Supplier XOR BOM: a built Part is made in-house, so it names no Supplier at all.
    partRow({ code: 'P-400', id: BUILT_PART_ID, isInternallyFabricated: true, supplierId: null }),
  ]);
}

async function seedTestUser(db: Db, input: { id: string; name: string }): Promise<void> {
  await db.insert(user).values({
    createdAt: new Date(),
    email: `${input.id}@example.com`,
    emailVerified: true,
    id: input.id,
    name: input.name,
    role: 'admin',
    updatedAt: new Date(),
  });
}

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
    supplierId: SUPPLIER_A_ID,
    unitOfMeasure: 'piece',
    ...overrides,
  };
}

async function seedJobs(db: Db): Promise<[string, string]> {
  const [customer] = await db
    .insert(customers)
    .values({
      companyName: 'PO Job Customer',
      email: 'jobs@example.com',
      phone: '0123456789',
      vatNumber: 'VAT-PO',
    })
    .returning({ id: customers.id });
  if (!customer) throw new Error('Customer insert did not return a row');

  const jobIds: string[] = [];
  for (const workTitle of ['Pump rebuild', 'Trailer repair']) {
    const [quote] = await db
      .insert(quotes)
      .values({
        customerId: customer.id,
        kind: 'custom',
        productId: null,
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_ID,
        status: 'draft',
        workTitle,
      })
      .returning({ id: quotes.id });
    if (!quote) throw new Error('Quote insert did not return a row');
    const [job] = await db.insert(jobs).values({ quoteId: quote.id }).returning({ id: jobs.id });
    if (!job) throw new Error('Job insert did not return a row');
    jobIds.push(job.id);
  }

  const [first, second] = jobIds;
  if (!first || !second) throw new Error('Job fixtures were not created');
  return [first, second];
}

function pdfBytes(): Uint8Array {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
}
