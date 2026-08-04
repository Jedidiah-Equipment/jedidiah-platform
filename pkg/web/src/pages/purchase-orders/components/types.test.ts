import { PurchaseOrderView, type StockMovementWarningCode } from '@pkg/schema';
import { describe, expect, it, vi } from 'vitest';

import {
  confirmMovementWarnings,
  outstandingQuantity,
  outstandingReceivedQuantity,
  PurchaseOrderCreateFormValues,
  PurchaseOrderDraftFormValues,
  PurchaseOrderReceiveFormValues,
  PurchaseOrderReturnFormValues,
  purchaseOrderAmendmentValidator,
  toPurchaseOrderCreateInput,
  toPurchaseOrderDraftFormValues,
  toPurchaseOrderDraftInput,
  toReceiptInput,
  toReturnToSupplierInput,
} from './types.js';

const PART_ID = '4de0e2a1-2b2f-4b2e-9a5f-6a0d0a1b2c3d';
const JOB_ID = '9c9e8b7a-6d5c-4b3a-8291-0f1e2d3c4b5a';

const LINEAR_PART_ID = '2f7c9a10-3f4b-4f0c-9d4a-8b1c2d3e4f50';

const purchaseOrder = PurchaseOrderView.parse({
  closedShortAt: null,
  code: 'PO-00001',
  createdAt: '2026-08-02T08:00:00.000Z',
  derivedStatus: 'draft',
  documentId: null,
  expectedDeliveryDate: '2026-08-20',
  id: 'f0e6a166-6958-46c0-a2e6-271bad486859',
  jobs: [{ code: 'JOB-00007', id: JOB_ID }],
  lines: [
    {
      partCode: 'P-100',
      partId: PART_ID,
      partName: 'Bearing',
      quantity: 4,
      receivedQuantity: 1,
      standardPurchaseLengthMm: null,
      unitOfMeasure: 'piece',
      unitPrice: 125.5,
    },
    {
      partCode: 'C-200',
      partId: LINEAR_PART_ID,
      partName: 'Channel',
      quantity: 3,
      receivedQuantity: 5,
      standardPurchaseLengthMm: 6_000,
      unitOfMeasure: 'mm',
      unitPrice: 900,
    },
  ],
  sentAt: null,
  status: 'draft',
  supplier: {
    address: null,
    companyName: 'Steel Supply Co',
    contactPerson: null,
    email: null,
    id: '762b0045-d030-4897-918d-dc50eea5469c',
    phone: null,
  },
  supplierId: '762b0045-d030-4897-918d-dc50eea5469c',
  updatedAt: '2026-08-02T08:00:00.000Z',
});

describe('Purchase Order draft form values', () => {
  it('maps the whole editable order — header, lines, and Job links — into one set of values', () => {
    expect(toPurchaseOrderDraftFormValues(purchaseOrder)).toEqual({
      expectedDeliveryDate: '2026-08-20',
      jobIds: [JOB_ID],
      lines: [
        { partId: PART_ID, quantity: 4, unitPrice: 125.5 },
        { partId: LINEAR_PART_ID, quantity: 3, unitPrice: 900 },
      ],
      supplierId: purchaseOrder.supplierId,
    });
  });

  it('maps an empty delivery date to null for the API', () => {
    const values = PurchaseOrderDraftFormValues.parse({
      expectedDeliveryDate: '',
      jobIds: [],
      lines: [],
      supplierId: purchaseOrder.supplierId,
    });

    expect(toPurchaseOrderDraftInput(purchaseOrder.id, values)).toEqual({
      expectedDeliveryDate: null,
      id: purchaseOrder.id,
      jobIds: [],
      lines: [],
      supplierId: purchaseOrder.supplierId,
    });
  });

  it('rejects a Part appearing on two lines, the same rule the save input enforces', () => {
    const duplicated = {
      expectedDeliveryDate: '',
      jobIds: [],
      lines: [
        { partId: PART_ID, quantity: 1, unitPrice: 10 },
        { partId: PART_ID, quantity: 2, unitPrice: 20 },
      ],
      supplierId: purchaseOrder.supplierId,
    };

    expect(PurchaseOrderDraftFormValues.safeParse(duplicated).success).toBe(false);
  });

  it('creates a draft from the supplier and expected date alone', () => {
    const values = PurchaseOrderCreateFormValues.parse({
      expectedDeliveryDate: '2026-08-20',
      supplierId: purchaseOrder.supplierId,
    });

    expect(toPurchaseOrderCreateInput(values)).toEqual({
      expectedDeliveryDate: '2026-08-20',
      supplierId: purchaseOrder.supplierId,
    });
  });
});

describe('Purchase Order receiving values', () => {
  it("requires explicit confirmation only when a warning is present, in the caller's words", () => {
    const confirm = vi.fn(() => false);
    const messageFor = vi.fn(() => 'This receipt takes the line past the quantity ordered.');
    const receipt = (warnings: StockMovementWarningCode[]) =>
      confirmMovementWarnings({ action: 'Receive it anyway?', confirm, messageFor, warnings });

    expect(receipt([])).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(receipt(['exceeds-ordered'])).toBe(false);
    expect(confirm).toHaveBeenCalledWith('This receipt takes the line past the quantity ordered. Receive it anyway?');
    confirm.mockReturnValue(true);
    expect(receipt(['exceeds-ordered'])).toBe(true);

    // The same helper carries the return's own verb, so the two prompts cannot drift apart.
    expect(
      confirmMovementWarnings({ action: 'Post it anyway?', confirm, messageFor, warnings: ['exceeds-received'] }),
    ).toBe(true);
    expect(confirm).toHaveBeenLastCalledWith('This receipt takes the line past the quantity ordered. Post it anyway?');
  });
  const [pieceLine, linearLine] = purchaseOrder.lines;
  if (!pieceLine || !linearLine) throw new Error('Purchase Order fixture is missing its lines');

  it('prefills the dock with what a line is still waiting on', () => {
    expect(outstandingQuantity(pieceLine)).toBe(3);
  });

  it('floors an over-delivered line at zero outstanding rather than going negative', () => {
    expect(outstandingQuantity(linearLine)).toBe(0);
  });

  it('sends no length for a discrete line and ignores a price from a price-blind dock', () => {
    const values = PurchaseOrderReceiveFormValues.parse({ lengthMm: Number.NaN, quantity: 3, unitCost: 140 });

    expect(toReceiptInput({ canReadCosts: false, line: pieceLine, purchaseOrderId: purchaseOrder.id, values })).toEqual(
      {
        lengthMm: null,
        partId: PART_ID,
        purchaseOrderId: purchaseOrder.id,
        quantity: 3,
        unitCost: null,
      },
    );
  });

  it('carries an optional cost override from an authorized dock', () => {
    const values = PurchaseOrderReceiveFormValues.parse({ lengthMm: Number.NaN, quantity: 3, unitCost: 140 });

    expect(
      toReceiptInput({ canReadCosts: true, line: pieceLine, purchaseOrderId: purchaseOrder.id, values }),
    ).toMatchObject({ unitCost: 140 });
  });

  it('leaves a blank linear length null so the ledger fills the standard purchase length', () => {
    const values = PurchaseOrderReceiveFormValues.parse({ lengthMm: Number.NaN, quantity: 2, unitCost: Number.NaN });

    expect(
      toReceiptInput({ canReadCosts: true, line: linearLine, purchaseOrderId: purchaseOrder.id, values }),
    ).toMatchObject({
      lengthMm: null,
      partId: LINEAR_PART_ID,
    });
  });

  it('carries a keyed length through for a short delivery', () => {
    const values = PurchaseOrderReceiveFormValues.parse({ lengthMm: 3_000, quantity: 1, unitCost: Number.NaN });

    expect(
      toReceiptInput({ canReadCosts: true, line: linearLine, purchaseOrderId: purchaseOrder.id, values }),
    ).toMatchObject({
      lengthMm: 3_000,
    });
  });

  it('rejects a receipt of nothing', () => {
    expect(
      PurchaseOrderReceiveFormValues.safeParse({ lengthMm: Number.NaN, quantity: 0, unitCost: Number.NaN }).success,
    ).toBe(false);
  });
});

describe('Purchase Order amendment values', () => {
  it('insists on a Part only for the kinds that name one', () => {
    const values = { newPartId: '', note: 'Agreed by phone', quantity: 2, unitPrice: 10 };

    expect(purchaseOrderAmendmentValidator('quantity-change').safeParse(values).success).toBe(true);
    expect(purchaseOrderAmendmentValidator('add-line').safeParse(values).success).toBe(false);
    expect(purchaseOrderAmendmentValidator('substitute-part').safeParse(values).success).toBe(false);
    expect(
      purchaseOrderAmendmentValidator('add-line').safeParse({ ...values, newPartId: LINEAR_PART_ID }).success,
    ).toBe(true);
  });

  it('holds every kind to the mandatory note the schema owns', () => {
    const values = { newPartId: LINEAR_PART_ID, note: '   ', quantity: 2, unitPrice: 10 };

    for (const kind of ['quantity-change', 'add-line', 'substitute-part'] as const) {
      expect(purchaseOrderAmendmentValidator(kind).safeParse(values).success, kind).toBe(false);
    }
  });
});

describe('Purchase Order return values', () => {
  const [pieceLine, linearLine] = purchaseOrder.lines;
  if (!pieceLine || !linearLine) throw new Error('Purchase Order fixture is missing its lines');

  it('counts what a line can still send back without double-counting the netted returns', () => {
    // The linear line's `receivedQuantity` of 5 is what the server says it has *kept*.
    expect(outstandingReceivedQuantity({ line: linearLine, returns: [] })).toBe(5);

    // A defective return has already been netted out of that 5 server-side, because it re-opens the
    // line. Subtracting it again here would report less stock on hand than the shelf holds.
    expect(
      outstandingReceivedQuantity({
        line: linearLine,
        returns: [{ partId: LINEAR_PART_ID, quantity: 2, reason: 'defective' }],
      }),
    ).toBe(5);

    // An `order-error` return is deliberately left in the received figure, so it comes off here.
    expect(
      outstandingReceivedQuantity({
        line: linearLine,
        returns: [{ partId: LINEAR_PART_ID, quantity: 2, reason: 'order-error' }],
      }),
    ).toBe(3);

    // Another line's returns are none of this line's business.
    expect(
      outstandingReceivedQuantity({
        line: linearLine,
        returns: [{ partId: PART_ID, quantity: 2, reason: 'order-error' }],
      }),
    ).toBe(5);

    // And it never goes negative, however the two figures happen to line up.
    expect(
      outstandingReceivedQuantity({
        line: linearLine,
        returns: [{ partId: LINEAR_PART_ID, quantity: 9, reason: 'order-error' }],
      }),
    ).toBe(0);
  });

  it('sends no length for a discrete line and blanks an empty note', () => {
    const values = PurchaseOrderReturnFormValues.parse({
      lengthMm: Number.NaN,
      note: '',
      quantity: 2,
      reason: 'defective',
    });

    expect(toReturnToSupplierInput({ line: pieceLine, purchaseOrderId: purchaseOrder.id, values })).toEqual({
      lengthMm: null,
      note: null,
      partId: pieceLine.partId,
      purchaseOrderId: purchaseOrder.id,
      quantity: 2,
      reason: 'defective',
    });
  });

  it('keys a length only on a linear line, and only when the dock typed one', () => {
    const parse = (lengthMm: number) =>
      PurchaseOrderReturnFormValues.parse({ lengthMm, note: 'Bent', quantity: 1, reason: 'wrong-item' });
    const forLine = (line: typeof linearLine, lengthMm: number) =>
      toReturnToSupplierInput({ line, purchaseOrderId: purchaseOrder.id, values: parse(lengthMm) });

    expect(forLine(linearLine, 3_000).lengthMm).toBe(3_000);
    expect(forLine(linearLine, Number.NaN).lengthMm).toBeNull();
    expect(forLine(pieceLine, 3_000).lengthMm).toBeNull();
  });
});
