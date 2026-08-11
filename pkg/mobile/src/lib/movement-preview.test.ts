import type { JobStockResult, PartPurchaseOrderLine, StockOnHandRow } from '@pkg/schema';
import { JobCode, PurchaseOrderCode } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import {
  previewJobMovementWarnings,
  previewReceiptWarnings,
  previewReturnToSupplierWarnings,
} from './movement-preview';

const PART_ID = '00000000-0000-4000-8000-000000000001';

function stockRow(overrides: Partial<StockOnHandRow> = {}): StockOnHandRow {
  return {
    asOfLastCount: null,
    averageUnitCost: 10,
    buckets: [{ lengthMm: 6_000, quantity: 4, totalValue: 40 }],
    committed: 0,
    free: 4,
    isInternallyFabricated: false,
    partCode: 'RAW-100',
    partId: PART_ID,
    partName: 'Channel',
    quantity: 4,
    standardPurchaseLengthMm: 6_000,
    stockTrackingMode: 'perpetual',
    totalValue: 40,
    unitOfMeasure: 'mm',
    ...overrides,
  };
}

function jobStock(overrides: Partial<JobStockResult['items'][number]> = {}): JobStockResult {
  return {
    items: [
      {
        cfoQuantity: 0,
        committedQuantity: 0,
        drawnQuantity: 0,
        freeQuantity: 4,
        isInternallyFabricated: false,
        lengthBuckets: [],
        onOrder: 0,
        partCode: 'RAW-100',
        partId: PART_ID,
        partName: 'Channel',
        standardPurchaseLengthMm: 6_000,
        stockTrackingMode: 'perpetual',
        supplierName: 'Steel Supply Co',
        unitOfMeasure: 'mm',
        ...overrides,
      },
    ],
    job: {
      cancelledAt: null,
      closedOutAt: null,
      code: JobCode.parse('JOB-00001'),
      completedOn: null,
      displayName: 'JOB-00001',
      id: PART_ID,
    },
  };
}

function orderLine(overrides: Partial<PartPurchaseOrderLine> = {}): PartPurchaseOrderLine {
  return {
    closedShortAt: null,
    expectedDeliveryDate: null,
    orderedQuantity: 10,
    outstandingQuantity: 5,
    purchaseOrderCode: PurchaseOrderCode.parse('PO-00001'),
    purchaseOrderId: PART_ID,
    receiptBuckets: [
      { lengthMm: 6_000, outstandingReceivedQuantity: 5 },
      { lengthMm: 3_000, outstandingReceivedQuantity: 2 },
    ],
    receivedQuantity: 5,
    supplierName: 'Steel Supply Co',
    ...overrides,
  };
}

describe('previewJobMovementWarnings', () => {
  test('stays silent until the Job stock has arrived, rather than warning on every draw', () => {
    expect(
      previewJobMovementWarnings({
        jobStock: undefined,
        lengthMm: 6_000,
        movementType: 'checkout',
        quantity: 99,
        row: stockRow(),
      }),
    ).toEqual([]);
  });

  test('warns on a draw the served facts say the rack cannot cover', () => {
    expect(
      previewJobMovementWarnings({
        jobStock: jobStock(),
        lengthMm: 6_000,
        movementType: 'checkout',
        quantity: 5,
        row: stockRow(),
      }),
    ).toEqual(['negative-stock-on-hand']);
  });

  test('judges a return against the length bucket it names, not the Part total', () => {
    const stock = jobStock({ drawnQuantity: 9, lengthBuckets: [{ drawnQuantity: 2, lengthMm: 6_000 }] });

    expect(
      previewJobMovementWarnings({
        jobStock: stock,
        lengthMm: 6_000,
        movementType: 'return-to-store',
        quantity: 3,
        row: stockRow(),
      }),
    ).toEqual(['exceeds-drawn']);
  });
});

describe('previewReceiptWarnings', () => {
  test('says nothing until a line is picked', () => {
    expect(previewReceiptWarnings({ line: null, quantity: 99 })).toEqual([]);
  });

  test('warns past what the line ordered, counting what it already took', () => {
    expect(previewReceiptWarnings({ line: orderLine(), quantity: 5 })).toEqual([]);
    expect(previewReceiptWarnings({ line: orderLine(), quantity: 6 })).toEqual(['exceeds-ordered']);
  });
});

describe('previewReturnToSupplierWarnings', () => {
  test('reads the bucket the return names rather than the line total', () => {
    // Part-wide the line holds seven, so a Part-wide threshold would wave this through.
    expect(previewReturnToSupplierWarnings({ lengthMm: 3_000, line: orderLine(), quantity: 3 })).toEqual([
      'exceeds-received',
    ]);
    expect(previewReturnToSupplierWarnings({ lengthMm: 6_000, line: orderLine(), quantity: 3 })).toEqual([]);
  });

  test('treats a length nothing arrived in as holding nothing to send back', () => {
    expect(previewReturnToSupplierWarnings({ lengthMm: 9_000, line: orderLine(), quantity: 1 })).toEqual([
      'exceeds-received',
    ]);
  });
});
