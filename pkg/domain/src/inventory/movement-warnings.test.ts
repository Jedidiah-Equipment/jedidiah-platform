import { describe, expect, it } from 'vitest';

import { deriveReceiptWarnings, deriveStockMovementWarnings, type StockMovementContext } from './movement-warnings.js';

const stocked: StockMovementContext = {
  bucketQuantityOnHand: 10,
  cfoQuantity: 4,
  drawnBucketQuantity: 0,
  drawnQuantity: 0,
};

describe('deriveStockMovementWarnings', () => {
  it('stays quiet for a draw inside the CFO with stock to cover it', () => {
    expect(deriveStockMovementWarnings({ context: stocked, movementType: 'checkout', quantity: 4 })).toEqual([]);
  });

  it('warns once a draw takes the Job past its CFO', () => {
    expect(deriveStockMovementWarnings({ context: stocked, movementType: 'checkout', quantity: 5 })).toEqual([
      'exceeds-cfo',
    ]);
  });

  it('counts earlier draws towards the CFO', () => {
    const context = { ...stocked, drawnQuantity: 3 };

    expect(deriveStockMovementWarnings({ context, movementType: 'checkout', quantity: 2 })).toEqual(['exceeds-cfo']);
  });

  it('warns on an off-CFO draw, which has no demand behind it at all', () => {
    const context = { ...stocked, cfoQuantity: 0 };

    expect(deriveStockMovementWarnings({ context, movementType: 'checkout', quantity: 1 })).toEqual(['exceeds-cfo']);
  });

  it('warns when a draw would take the length bucket negative', () => {
    const context = { ...stocked, bucketQuantityOnHand: 1, cfoQuantity: 10 };

    expect(deriveStockMovementWarnings({ context, movementType: 'checkout', quantity: 2 })).toEqual([
      'negative-stock-on-hand',
    ]);
  });

  it('raises both draw warnings together', () => {
    const context = { ...stocked, bucketQuantityOnHand: 0, cfoQuantity: 0 };

    expect(deriveStockMovementWarnings({ context, movementType: 'checkout', quantity: 1 })).toEqual([
      'exceeds-cfo',
      'negative-stock-on-hand',
    ]);
  });

  it('never warns about stock on hand for a return, which only ever adds', () => {
    const context = { ...stocked, bucketQuantityOnHand: -5, drawnBucketQuantity: 3 };

    expect(deriveStockMovementWarnings({ context, movementType: 'return-to-store', quantity: 3 })).toEqual([]);
  });

  it('warns when a return exceeds what this Job still has drawn', () => {
    const context = { ...stocked, drawnBucketQuantity: 2 };

    expect(deriveStockMovementWarnings({ context, movementType: 'return-to-store', quantity: 3 })).toEqual([
      'exceeds-drawn',
    ]);
  });

  it('judges a return against its own length bucket, not the Part total', () => {
    const context = { ...stocked, drawnBucketQuantity: 0, drawnQuantity: 6 };

    expect(deriveStockMovementWarnings({ context, movementType: 'return-to-store', quantity: 1 })).toEqual([
      'exceeds-drawn',
    ]);
  });
});

describe('deriveReceiptWarnings', () => {
  it('stays quiet while the delivery is still inside the ordered quantity', () => {
    expect(deriveReceiptWarnings({ orderedQuantity: 10, quantity: 4, receivedQuantity: 0 })).toEqual([]);
  });

  it('stays quiet on the receipt that completes the line exactly', () => {
    expect(deriveReceiptWarnings({ orderedQuantity: 10, quantity: 6, receivedQuantity: 4 })).toEqual([]);
  });

  it('warns once the delivery would take the line past what was ordered', () => {
    expect(deriveReceiptWarnings({ orderedQuantity: 10, quantity: 7, receivedQuantity: 4 })).toEqual([
      'exceeds-ordered',
    ]);
  });

  it('counts earlier receipts, so a small over-receipt on a nearly full line still warns', () => {
    expect(deriveReceiptWarnings({ orderedQuantity: 10, quantity: 1, receivedQuantity: 10 })).toEqual([
      'exceeds-ordered',
    ]);
  });
});
