import { describe, expect, test } from 'vitest';

import {
  PurchaseOrderCode,
  PurchaseOrderCreateInput,
  PurchaseOrderLine,
  PurchaseOrderReplaceJobLinksInput,
  PurchaseOrderReplaceLinesInput,
  PurchaseOrderStatus,
} from './purchase-order.js';

const ID_A = '00000000-0000-4000-8000-000000000001';
const ID_B = '00000000-0000-4000-8000-000000000002';

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

  test('accepts monetary line inputs but exposes a nullable projected price', () => {
    expect(
      PurchaseOrderLine.parse({
        partCode: 'PIPE-01',
        partId: ID_A,
        partName: 'Hydraulic pipe',
        quantity: 2,
        standardPurchaseLengthMm: 6_000,
        unitOfMeasure: 'mm',
        unitPrice: null,
      }),
    ).toMatchObject({ quantity: 2, unitPrice: null });

    expect(
      PurchaseOrderReplaceLinesInput.safeParse({
        id: ID_B,
        lines: [{ partId: ID_A, quantity: 1.25, unitPrice: 125.5 }],
      }).success,
    ).toBe(true);
  });

  test('rejects duplicate parts and duplicate linked Jobs in replacement inputs', () => {
    expect(
      PurchaseOrderReplaceLinesInput.safeParse({
        id: ID_B,
        lines: [
          { partId: ID_A, quantity: 1, unitPrice: 10 },
          { partId: ID_A, quantity: 2, unitPrice: 20 },
        ],
      }).success,
    ).toBe(false);
    expect(PurchaseOrderReplaceJobLinksInput.safeParse({ id: ID_B, jobIds: [ID_A, ID_A] }).success).toBe(false);
  });
});
