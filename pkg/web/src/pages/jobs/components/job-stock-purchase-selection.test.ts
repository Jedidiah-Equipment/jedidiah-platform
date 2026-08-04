import { describe, expect, it } from 'vitest';

import { toJobStockPurchaseCandidates } from './job-stock-purchase-selection.js';

const stockRow = (
  partId: string,
  facts: { committed: number; fabricated?: boolean; free?: number; onOrder?: number; supplier?: string | null },
) => ({
  committedQuantity: facts.committed,
  freeQuantity: facts.free ?? 0,
  isInternallyFabricated: facts.fabricated ?? false,
  onOrder: facts.onOrder ?? 0,
  partCode: partId.toUpperCase(),
  partId,
  partName: `Part ${partId}`,
  supplierName: facts.supplier === undefined ? 'Acme Supplies' : facts.supplier,
  unitOfMeasure: 'piece' as const,
});

describe('toJobStockPurchaseCandidates', () => {
  it('nets free stock out of the outstanding commitment and carries the Supplier through', () => {
    const candidates = toJobStockPurchaseCandidates([stockRow('a', { committed: 6, free: 4 })]);

    expect(candidates).toEqual([
      expect.objectContaining({ partId: 'a', suggestedQuantity: 2, supplierName: 'Acme Supplies' }),
    ]);
  });

  it('counts negative free as part of the shortfall', () => {
    expect(toJobStockPurchaseCandidates([stockRow('a', { committed: 6, free: -3 })])[0]?.suggestedQuantity).toBe(9);
  });

  it('nets what is already on order, so the Job tab cannot re-order what a sent order covers', () => {
    expect(
      toJobStockPurchaseCandidates([stockRow('a', { committed: 6, free: 1, onOrder: 3 })])[0]?.suggestedQuantity,
    ).toBe(2);
  });

  it('suggests nothing when free stock and open orders already cover the commitment', () => {
    expect(
      toJobStockPurchaseCandidates([stockRow('a', { committed: 2, free: 1, onOrder: 5 })])[0]?.suggestedQuantity,
    ).toBe(0);
  });

  it('still offers a fully covered Part, so the buyer can order it deliberately', () => {
    const candidates = toJobStockPurchaseCandidates([stockRow('a', { committed: 2, free: 10 })]);

    expect(candidates.map((candidate) => candidate.partId)).toEqual(['a']);
  });

  it('drops Parts with no open commitment and Built Parts', () => {
    const candidates = toJobStockPurchaseCandidates([
      stockRow('a', { committed: 0 }),
      stockRow('b', { committed: 5, fabricated: true, supplier: null }),
      stockRow('c', { committed: 5 }),
    ]);

    expect(candidates.map((candidate) => candidate.partId)).toEqual(['c']);
  });
});
