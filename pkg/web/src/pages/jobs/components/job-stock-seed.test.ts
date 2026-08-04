import { describe, expect, it } from 'vitest';

import { toJobStockSeedCandidates } from './job-stock-seed.js';

const stockRow = (partId: string, free: number, isInternallyFabricated = false) => ({
  free,
  isInternallyFabricated,
  partId,
});

const jobRow = (partId: string, committedQuantity: number) => ({
  committedQuantity,
  partCode: partId.toUpperCase(),
  partId,
  partName: `Part ${partId}`,
  unitOfMeasure: 'piece' as const,
});

describe('toJobStockSeedCandidates', () => {
  it('nets free stock out of the outstanding commitment', () => {
    const candidates = toJobStockSeedCandidates({
      items: [jobRow('a', 6)],
      stockOnHand: [stockRow('a', 4)],
    });

    expect(candidates).toEqual([expect.objectContaining({ partId: 'a', suggestedQuantity: 2 })]);
  });

  it('counts negative free as part of the shortfall', () => {
    const candidates = toJobStockSeedCandidates({
      items: [jobRow('a', 6)],
      stockOnHand: [stockRow('a', -3)],
    });

    expect(candidates[0]?.suggestedQuantity).toBe(9);
  });

  it('suggests nothing when free stock already covers the commitment', () => {
    const candidates = toJobStockSeedCandidates({
      items: [jobRow('a', 2)],
      stockOnHand: [stockRow('a', 10)],
    });

    expect(candidates[0]?.suggestedQuantity).toBe(0);
  });

  it('drops Parts with no open commitment and Built Parts', () => {
    const candidates = toJobStockSeedCandidates({
      items: [jobRow('a', 0), jobRow('b', 5), jobRow('c', 5)],
      stockOnHand: [stockRow('a', 0), stockRow('b', 0, true), stockRow('c', 0)],
    });

    expect(candidates.map((candidate) => candidate.partId)).toEqual(['c']);
  });

  it('treats a Part with no ledger row at all as zero free', () => {
    const candidates = toJobStockSeedCandidates({ items: [jobRow('a', 3)], stockOnHand: [] });

    expect(candidates[0]?.suggestedQuantity).toBe(3);
  });
});
