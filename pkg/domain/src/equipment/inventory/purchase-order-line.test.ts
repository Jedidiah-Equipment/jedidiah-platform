import { describe, expect, test } from 'vitest';

import { comparePurchaseOrderLines, purchaseOrderLineSubjectKey } from './purchase-order-line.js';

describe('Purchase Order line identity and order', () => {
  test('names a Part Line by its Part and a Custom Line by its own id', () => {
    expect(purchaseOrderLineSubjectKey({ id: 'line-1', partId: 'part-1' })).toBe('part-1');
    expect(purchaseOrderLineSubjectKey({ id: 'line-2', partId: null })).toBe('line-2');
    expect(purchaseOrderLineSubjectKey({ id: 'line-3' })).toBe('line-3');
  });

  test('orders Part Lines by code, then Custom Lines by position', () => {
    const lines = [
      { partCode: null, position: 1 },
      { partCode: 'P-200', position: 0 },
      { partCode: null, position: 0 },
      { partCode: 'P-100', position: 0 },
    ];

    expect(lines.sort(comparePurchaseOrderLines)).toEqual([
      { partCode: 'P-100', position: 0 },
      { partCode: 'P-200', position: 0 },
      { partCode: null, position: 0 },
      { partCode: null, position: 1 },
    ]);
  });
});
