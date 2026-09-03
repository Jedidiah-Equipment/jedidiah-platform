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
  standardPurchaseLengthMm: null,
  stockTrackingMode: 'perpetual' as const,
  supplierName: facts.supplier === undefined ? 'Acme Supplies' : facts.supplier,
  unitOfMeasure: 'piece' as const,
});

describe('toJobStockPurchaseCandidates', () => {
  it('asks for nothing while Free Stock is not negative, and carries the Supplier through', () => {
    // Free Stock already has this Job's own commitment taken off, so free >= 0 means it is covered:
    // six committed against six on the shelf reads free = 0 and needs no order at all.
    const candidates = toJobStockPurchaseCandidates([stockRow('a', { committed: 6, free: 0 })]);

    expect(candidates).toEqual([
      expect.objectContaining({ partId: 'a', suggestedQuantity: 0, supplierName: 'Acme Supplies' }),
    ]);
  });

  it('asks for the plant shortfall once Free Stock has gone negative', () => {
    expect(toJobStockPurchaseCandidates([stockRow('a', { committed: 6, free: -4 })])[0]?.suggestedQuantity).toBe(4);
  });

  it('never asks for more than this Job itself committed, however short the plant is', () => {
    // Two Jobs of 6 against an empty shelf: each asks for its own 6, not the whole 12.
    expect(toJobStockPurchaseCandidates([stockRow('a', { committed: 6, free: -12 })])[0]?.suggestedQuantity).toBe(6);
  });

  it('nets what is already on order, so the Job tab cannot re-order what a sent order covers', () => {
    expect(
      toJobStockPurchaseCandidates([stockRow('a', { committed: 6, free: -5, onOrder: 3 })])[0]?.suggestedQuantity,
    ).toBe(2);
  });

  it('suggests nothing when open orders already cover the shortfall', () => {
    expect(
      toJobStockPurchaseCandidates([stockRow('a', { committed: 2, free: -1, onOrder: 5 })])[0]?.suggestedQuantity,
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
