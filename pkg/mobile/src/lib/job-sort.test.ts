import { DateIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { isJobSort, sortJobCards } from './job-sort';
import type { JobListCard } from './use-job-list';

// A Job card reduced to the fields sortJobCards reads; the rest of JobListCard is irrelevant here.
function card(jobCode: string, daysLeft: number, createdAt = '2026-01-01T00:00:00.000Z'): JobListCard {
  return {
    jobId: jobCode,
    jobCode,
    createdAt: DateIso.parse(createdAt),
    jobDisplayName: jobCode,
    productThumbnailDataUrl: null,
    customerCompanyName: null,
    operator: null,
    progress: { daysLeft } as JobListCard['progress'],
    tone: 'muted',
  };
}

const codes = (cards: readonly JobListCard[]) => cards.map((job) => job.jobCode);

describe('sortJobCards', () => {
  it('accepts only the known sort modes', () => {
    expect(isJobSort('days-left')).toBe(true);
    expect(isJobSort('newest')).toBe(true);

    for (const value of ['', 'createdAt', 'oldest', null, undefined, 0, {}]) {
      expect(isJobSort(value)).toBe(false);
    }
  });

  it('orders by fewest days left', () => {
    const cards = [card('JOB-00009', 9), card('JOB-00002', 2), card('JOB-00005', 5)];

    expect(codes(sortJobCards(cards, 'days-left'))).toEqual(['JOB-00002', 'JOB-00005', 'JOB-00009']);
  });

  it('breaks days-left ties by Job code', () => {
    const cards = [card('JOB-00031', 3), card('JOB-00007', 3)];

    expect(codes(sortJobCards(cards, 'days-left'))).toEqual(['JOB-00007', 'JOB-00031']);
  });

  it('orders newest Jobs first', () => {
    const cards = [
      card('JOB-00009', 1, '2026-01-09T00:00:00.000Z'),
      card('JOB-00002', 9, '2026-03-02T00:00:00.000Z'),
      card('JOB-00005', 5, '2026-02-05T00:00:00.000Z'),
    ];

    expect(codes(sortJobCards(cards, 'newest'))).toEqual(['JOB-00002', 'JOB-00005', 'JOB-00009']);
  });

  it('breaks newest ties by Job code', () => {
    const cards = [card('JOB-00031', 1), card('JOB-00007', 9)];

    expect(codes(sortJobCards(cards, 'newest'))).toEqual(['JOB-00007', 'JOB-00031']);
  });

  it('does not mutate the input array', () => {
    const cards = [card('JOB-00009', 9), card('JOB-00002', 2)];
    const original = [...cards];

    sortJobCards(cards, 'newest');

    expect(cards).toEqual(original);
  });

  it('handles an empty list', () => {
    expect(sortJobCards([], 'days-left')).toEqual([]);
  });
});
