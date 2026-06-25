import { describe, expect, it } from 'vitest';

import { sortJobCards } from './job-sort';
import type { JobListCard } from './use-job-list';

// A Job card reduced to the fields sortJobCards reads; the rest of JobListCard is irrelevant here.
function card(jobCode: string, daysLeft: number): JobListCard {
  return {
    jobId: jobCode,
    jobCode,
    productName: jobCode,
    productThumbnailDataUrl: null,
    customerCompanyName: null,
    operator: null,
    progress: { daysLeft } as JobListCard['progress'],
  };
}

const codes = (cards: readonly JobListCard[]) => cards.map((job) => job.jobCode);

describe('sortJobCards', () => {
  it('orders by fewest days left', () => {
    const cards = [card('JOB-00009', 9), card('JOB-00002', 2), card('JOB-00005', 5)];

    expect(codes(sortJobCards(cards))).toEqual(['JOB-00002', 'JOB-00005', 'JOB-00009']);
  });

  it('breaks days-left ties by Job code', () => {
    const cards = [card('JOB-00031', 3), card('JOB-00007', 3)];

    expect(codes(sortJobCards(cards))).toEqual(['JOB-00007', 'JOB-00031']);
  });

  it('does not mutate the input array', () => {
    const cards = [card('JOB-00009', 9), card('JOB-00002', 2)];
    const original = [...cards];

    sortJobCards(cards);

    expect(cards).toEqual(original);
  });

  it('handles an empty list', () => {
    expect(sortJobCards([])).toEqual([]);
  });
});
