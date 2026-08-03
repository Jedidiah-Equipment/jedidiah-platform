import { describe, expect, test } from 'vitest';

import {
  PurchaseOrderCode,
  PurchaseOrderCreateInput,
  PurchaseOrderLine,
  PurchaseOrderLineView,
  PurchaseOrderSaveDraftInput,
  PurchaseOrderStatus,
} from './purchase-order.js';

const ID_A = '00000000-0000-4000-8000-000000000001';
const ID_B = '00000000-0000-4000-8000-000000000002';

const line = {
  partCode: 'PIPE-01',
  partId: ID_A,
  partName: 'Hydraulic pipe',
  quantity: 2,
  standardPurchaseLengthMm: 6_000,
  unitOfMeasure: 'mm',
} as const;

const draft = {
  expectedDeliveryDate: null,
  id: ID_B,
  jobIds: [] as string[],
  lines: [{ partId: ID_A, quantity: 1.25, unitPrice: 125.5 }],
  supplierId: ID_A,
};

describe('Purchase Order contracts', () => {
  test('formats the stored sequence number as the public PO code', () => {
    expect(PurchaseOrderCode.parse(42)).toBe('PO-00042');
  });

  test('creates an empty draft header with an optional expected date', () => {
    expect(PurchaseOrderCreateInput.parse({ supplierId: ID_A })).toEqual({
      expectedDeliveryDate: null,
      supplierId: ID_A,
    });
    expect(PurchaseOrderStatus.options).toEqual(['draft', 'sent', 'cancelled']);
  });

  test('keeps the stored line price, and nulls it only on the gated view', () => {
    expect(PurchaseOrderLine.parse({ ...line, unitPrice: 125.5 })).toMatchObject({ quantity: 2, unitPrice: 125.5 });
    expect(() => PurchaseOrderLine.parse({ ...line, unitPrice: null })).toThrow();
    expect(PurchaseOrderLineView.parse({ ...line, unitPrice: null })).toMatchObject({ unitPrice: null });
  });

  test('saves supplier, expected date, lines, and Job links as one draft', () => {
    expect(PurchaseOrderSaveDraftInput.safeParse(draft).success).toBe(true);
  });

  test('rejects a Part or a Job appearing twice on one draft', () => {
    expect(
      PurchaseOrderSaveDraftInput.safeParse({
        ...draft,
        lines: [
          { partId: ID_A, quantity: 1, unitPrice: 10 },
          { partId: ID_A, quantity: 2, unitPrice: 20 },
        ],
      }).success,
    ).toBe(false);
    expect(PurchaseOrderSaveDraftInput.safeParse({ ...draft, jobIds: [ID_A, ID_A] }).success).toBe(false);
  });
});
