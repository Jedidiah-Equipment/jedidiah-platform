import { parts, stockMovements } from '@pkg/db/equipment';
import type { SupplierInvoiceExtraction } from '@pkg/schema/equipment';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { postAdjustment } from '../inventory/stock-movement-service.js';
import { listPurchaseOrderDocuments } from './credit-note-service.js';
import {
  ACTOR_ID,
  type AmendmentTestContext,
  LINEAR_PART_ID,
  PIECE_PART_ID,
  pdfBytes,
  receive,
  renderStubPdf,
  SPARE_PART_ID,
  SUPPLIER_ID,
  sendOrder,
  test,
} from './purchase-order-amendment-fixtures.js';
import { amendPurchaseOrderQuantity } from './purchase-order-amendment-service.js';
import { createPurchaseOrder } from './purchase-order-service.js';
import {
  applyInvoicePrice,
  dismissInvoiceFlag,
  loadSupplierInvoiceReviews,
  type SupplierInvoiceExtractor,
  uploadSupplierInvoice,
} from './supplier-invoice-service.js';
import { listInvoicePriceVariance } from './supplier-invoice-variance-read.js';

function extraction(overrides: Partial<SupplierInvoiceExtraction> = {}): SupplierInvoiceExtraction {
  return {
    invoiceDate: '2026-08-04',
    invoiceNumber: 'INV-1',
    jobCodes: [],
    lines: [],
    ...overrides,
  } as SupplierInvoiceExtraction;
}

function line(overrides: Partial<SupplierInvoiceExtraction['lines'][number]> = {}) {
  return {
    description: '',
    jobCodes: [],
    lineTotal: null,
    partCode: 'P-100',
    quantity: 10,
    unitPrice: 25,
    ...overrides,
  } as SupplierInvoiceExtraction['lines'][number];
}

function reads(value: SupplierInvoiceExtraction): SupplierInvoiceExtractor {
  return async () => value;
}

const FAILS: SupplierInvoiceExtractor = async () => {
  throw new Error('provider is down');
};

async function upload(
  context: AmendmentTestContext,
  purchaseOrderId: string,
  extract: SupplierInvoiceExtractor,
  filename = 'INV-1.pdf',
) {
  return uploadSupplierInvoice({
    actorUserId: ACTOR_ID,
    bytes: pdfBytes(),
    db: context.db,
    extract,
    filename,
    input: { purchaseOrderId },
    storage: context.storage,
  });
}

async function reviewOf(context: AmendmentTestContext, purchaseOrderId: string) {
  const result = await loadSupplierInvoiceReviews({ db: context.db, purchaseOrderId });
  const [review] = result.items;
  if (!review) throw new Error('expected one Supplier invoice review');

  return review;
}

describe('supplier invoice cross-check', () => {
  test('files the invoice into the order collection and cross-checks an agreeing line clean', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 10);

    const document = await upload(context, purchaseOrder.id, reads(extraction({ lines: [line()] })));
    const documents = await listPurchaseOrderDocuments({ db: context.db, purchaseOrderId: purchaseOrder.id });
    const review = await reviewOf(context, purchaseOrder.id);

    expect(document).toMatchObject({ filename: 'INV-1.pdf', revision: null, type: 'supplier_invoice' });
    expect(documents.items).toMatchObject([
      { filename: 'INV-1.pdf', type: 'supplier_invoice' },
      { filename: 'PO-00001.pdf', revision: 1, type: 'purchase_order' },
    ]);
    expect(review).toMatchObject({ invoiceNumber: 'INV-1', readable: true });
    expect(review.rows).toMatchObject([{ flags: [], matchMethod: 'part-code', partId: PIECE_PART_ID }]);
  });

  test('retains the upload and reports an unreadable invoice when the extraction throws', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);

    const document = await upload(context, purchaseOrder.id, FAILS);
    const review = await reviewOf(context, purchaseOrder.id);

    expect(document).toMatchObject({ filename: 'INV-1.pdf', type: 'supplier_invoice' });
    expect(review).toMatchObject({ documentId: document.id, readable: false, rows: [] });
  });

  test('flags a price the Supplier billed above the order, and prices the correction', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 10);
    await upload(context, purchaseOrder.id, reads(extraction({ lines: [line({ unitPrice: 30 })] })));

    const review = await reviewOf(context, purchaseOrder.id);

    expect(review.rows[0]?.flags).toMatchObject([{ key: `price-mismatch:${PIECE_PART_ID}`, kind: 'price-mismatch' }]);
    // R5 too dear on all 10, all 10 still on the shelf: the whole difference lands on the average.
    expect(review.rows[0]?.correction).toMatchObject({
      averageUnitCost: 25,
      canApply: true,
      newAverageUnitCost: 30,
      receiptedUnitCost: 25,
      receivedQuantity: 10,
      stockOnHandBasis: 10,
    });
  });

  test('corrects a linear Part in the unit its average is kept in, not in pieces', async ({ context }) => {
    // A linear Part's average is per millimetre while its price is agreed per length, so the
    // correction has to divide the rand difference by millimetres on hand — dividing by pieces
    // would move the average by six thousand times too much.
    const purchaseOrder = await sendOrder(context, [{ partId: LINEAR_PART_ID, quantity: 2, unitPrice: 600 }]);
    await receive(context, purchaseOrder.id, LINEAR_PART_ID, 2);
    await upload(
      context,
      purchaseOrder.id,
      reads(extraction({ lines: [line({ partCode: 'P-200', quantity: 2, unitPrice: 660 })] })),
    );

    const review = await reviewOf(context, purchaseOrder.id);

    expect(review.rows[0]?.correction).toMatchObject({
      averageUnitCost: 0.1,
      canApply: true,
      newAverageUnitCost: 0.11,
      stockOnHandBasis: 12_000,
    });
  });

  test('refuses the correction once the stock it arrived as has been drawn away', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 10);
    await upload(context, purchaseOrder.id, reads(extraction({ lines: [line({ unitPrice: 30 })] })));
    // The shelf empties the way it would in life — the stock was drawn and the Job carries its cost.
    await postAdjustment({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        actorUserId: null,
        delta: -10,
        lengthMm: null,
        note: 'Drawn before the invoice arrived',
        partId: PIECE_PART_ID,
        reason: 'stock-count',
        unitCost: null,
      },
    });

    const review = await reviewOf(context, purchaseOrder.id);

    expect(review.rows[0]?.correction).toMatchObject({
      canApply: false,
      newAverageUnitCost: null,
      stockOnHandBasis: 0,
    });
    await expect(
      applyInvoicePrice({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          documentId: review.documentId,
          partId: PIECE_PART_ID,
          purchaseOrderId: purchaseOrder.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'invoice.price_not_applicable' });
  });

  test('applies a confirmed price as a revaluation, and stops asking about it', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 10);
    await upload(context, purchaseOrder.id, reads(extraction({ lines: [line({ unitPrice: 30 })] })));
    const before = await reviewOf(context, purchaseOrder.id);

    const resolution = await applyInvoicePrice({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { documentId: before.documentId, partId: PIECE_PART_ID, purchaseOrderId: purchaseOrder.id },
    });
    const after = await reviewOf(context, purchaseOrder.id);

    expect(resolution).toMatchObject({ actorName: 'Amendment Tester', kind: 'applied' });
    expect(resolution.stockMovementId).not.toBeNull();
    // The flag is still computed — the order line still says R25 — but it now carries its answer.
    expect(after.rows[0]?.flags).toMatchObject([{ kind: 'price-mismatch' }]);
    expect(after.resolutions[`price-mismatch:${PIECE_PART_ID}`]).toMatchObject({ kind: 'applied' });
    // The offer is withdrawn once answered. The receipts stay stamped at R25 forever, so a
    // correction left on offer would keep proposing the same R5 move on an average already at R30.
    expect(after.rows[0]?.correction).toBeNull();
    const [revaluation] = await context.db
      .select({
        delta: stockMovements.delta,
        movementType: stockMovements.movementType,
        unitCost: stockMovements.unitCost,
      })
      .from(stockMovements)
      .where(eq(stockMovements.id, resolution.stockMovementId ?? ''));
    expect(revaluation).toMatchObject({ delta: 0, movementType: 'revaluation', unitCost: 30 });
  });

  test('refuses to apply an invoiced price onto a Built Part, whose cost comes from its build', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 10);
    await upload(context, purchaseOrder.id, reads(extraction({ lines: [line({ unitPrice: 30 })] })));
    const review = await reviewOf(context, purchaseOrder.id);
    // The Part becomes a Built Part after its receipts. Every other ledger writer refuses a keyed
    // cost on one, and this path is held to the same rule (spec §5) rather than trusting that no
    // route into this state exists.
    await context.db
      .update(parts)
      .set({ isInternallyFabricated: true, supplierId: null })
      .where(eq(parts.id, PIECE_PART_ID));

    await expect(
      applyInvoicePrice({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { documentId: review.documentId, partId: PIECE_PART_ID, purchaseOrderId: purchaseOrder.id },
      }),
    ).rejects.toMatchObject({ code: 'inventory.fabricated_part_cost' });
  });

  test('refuses to apply the same flag twice', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 10);
    await upload(context, purchaseOrder.id, reads(extraction({ lines: [line({ unitPrice: 30 })] })));
    const review = await reviewOf(context, purchaseOrder.id);
    const input = { documentId: review.documentId, partId: PIECE_PART_ID, purchaseOrderId: purchaseOrder.id };

    await applyInvoicePrice({ actorUserId: ACTOR_ID, db: context.db, input });

    await expect(applyInvoicePrice({ actorUserId: ACTOR_ID, db: context.db, input })).rejects.toMatchObject({
      code: 'invoice.flag_already_resolved',
    });
  });

  test('persists a dismissal so the panel is the same on the next visit', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 10);
    await upload(context, purchaseOrder.id, reads(extraction({ lines: [line({ unitPrice: 30 })] })));
    const review = await reviewOf(context, purchaseOrder.id);
    const flagKey = `price-mismatch:${PIECE_PART_ID}`;

    const resolution = await dismissInvoiceFlag({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { documentId: review.documentId, flagKey, purchaseOrderId: purchaseOrder.id },
    });
    const after = await reviewOf(context, purchaseOrder.id);

    expect(resolution).toMatchObject({ kind: 'dismissed', stockMovementId: null });
    expect(after.resolutions[flagKey]).toMatchObject({ actorName: 'Amendment Tester', kind: 'dismissed' });
  });

  test('refuses a flag that is not on the invoice, so a stale panel cannot dismiss a phantom', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await upload(context, purchaseOrder.id, reads(extraction({ lines: [line()] })));
    const review = await reviewOf(context, purchaseOrder.id);

    await expect(
      dismissInvoiceFlag({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          documentId: review.documentId,
          flagKey: 'price-mismatch:not-a-part',
          purchaseOrderId: purchaseOrder.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'invoice.flag_not_found' });
  });

  test('re-matches against the amended order, so agreeing a quantity clears its flag', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await upload(context, purchaseOrder.id, reads(extraction({ lines: [line({ quantity: 12 })] })));

    expect((await reviewOf(context, purchaseOrder.id)).rows[0]?.flags).toMatchObject([{ kind: 'quantity-mismatch' }]);

    await amendPurchaseOrderQuantity({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { id: purchaseOrder.id, note: 'Supplier sent 12', partId: PIECE_PART_ID, quantity: 12 },
      pdfRenderer: renderStubPdf,
      storage: context.storage,
    });

    expect((await reviewOf(context, purchaseOrder.id)).rows[0]?.flags).toEqual([]);
  });

  test('flags both sides when the invoice bills something the order never asked for', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [
      { partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 },
      { partId: SPARE_PART_ID, quantity: 4, unitPrice: 5 },
    ]);
    await upload(
      context,
      purchaseOrder.id,
      reads(
        extraction({ lines: [line(), line({ description: 'Delivery', partCode: null, quantity: 1, unitPrice: 350 })] }),
      ),
    );

    const review = await reviewOf(context, purchaseOrder.id);

    expect(review.rows.map((row) => row.flags.map((flag) => flag.kind))).toEqual([
      [],
      ['unmatched-po-line'],
      ['unmatched-invoice-line'],
    ]);
  });

  test('carries the Job codes the Supplier echoed, from the header and the lines alike', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await upload(
      context,
      purchaseOrder.id,
      reads(extraction({ jobCodes: ['JOB-0421'], lines: [line({ jobCodes: ['JOB-0421', 'JOB-0422'] })] })),
    );

    expect((await reviewOf(context, purchaseOrder.id)).jobCodes).toEqual(['JOB-0421', 'JOB-0422']);
  });

  test('lists a priced disagreement plant-wide, with what was done about it', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 10);
    await upload(context, purchaseOrder.id, reads(extraction({ lines: [line({ unitPrice: 30 })] })));

    const before = await listInvoicePriceVariance({ db: context.db });

    expect(before.items).toMatchObject([
      {
        invoiceNumber: 'INV-1',
        invoiceUnitPrice: 30,
        partCode: 'P-100',
        purchaseOrderCode: 'PO-00001',
        quantity: 10,
        resolution: null,
        supplierName: 'Acme Supplies',
        unitPrice: 25,
        varianceValue: 50,
      },
    ]);

    const review = await reviewOf(context, purchaseOrder.id);
    await dismissInvoiceFlag({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        documentId: review.documentId,
        flagKey: `price-mismatch:${PIECE_PART_ID}`,
        purchaseOrderId: purchaseOrder.id,
      },
    });

    expect((await listInvoicePriceVariance({ db: context.db })).items).toMatchObject([{ resolution: 'dismissed' }]);
  });

  test('refuses an invoice against an order the Supplier was never sent', async ({ context }) => {
    const draft = await createPurchaseOrder({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { expectedDeliveryDate: null, supplierId: SUPPLIER_ID },
    });

    await expect(upload(context, draft.id, reads(extraction({ lines: [line()] })))).rejects.toMatchObject({
      code: 'purchase_order.not_sent',
    });
  });

  test('refuses a file whose bytes are not a PDF before it reaches the model', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    let called = false;

    await expect(
      uploadSupplierInvoice({
        actorUserId: ACTOR_ID,
        // Not a PDF. The bytes are the only thing that decides — nothing the upload claims is read.
        bytes: new Uint8Array([0x6e, 0x6f, 0x70, 0x65]),
        db: context.db,
        extract: async () => {
          called = true;
          throw new Error('the model should never have seen these bytes');
        },
        filename: 'not-really.pdf',
        input: { purchaseOrderId: purchaseOrder.id },
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'document.content_type_not_allowed' });
    expect(called).toBe(false);
  });

  test('leaves the variance unknown when the invoice printed a price against no quantity', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await receive(context, purchaseOrder.id, PIECE_PART_ID, 10);
    await upload(context, purchaseOrder.id, reads(extraction({ lines: [line({ quantity: null, unitPrice: 30 })] })));

    // Reporting the order's 10 here would state a R50 exposure the Supplier never billed, on the
    // very number the list is ranked by.
    expect((await listInvoicePriceVariance({ db: context.db })).items).toMatchObject([
      { invoiceUnitPrice: 30, quantity: null, unitPrice: 25, varianceValue: null },
    ]);
  });

  test('leaves an unreadable invoice out of the variance list entirely', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await upload(context, purchaseOrder.id, FAILS);

    expect((await listInvoicePriceVariance({ db: context.db })).items).toEqual([]);
  });

  test('re-reading one invoice replaces its extraction rather than filing a second one', async ({ context }) => {
    const purchaseOrder = await sendOrder(context, [{ partId: PIECE_PART_ID, quantity: 10, unitPrice: 25 }]);
    await upload(context, purchaseOrder.id, FAILS);
    await upload(context, purchaseOrder.id, reads(extraction({ lines: [line()] })), 'INV-2.pdf');

    const result = await loadSupplierInvoiceReviews({ db: context.db, purchaseOrderId: purchaseOrder.id });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.readable).sort()).toEqual([false, true]);
  });
});
