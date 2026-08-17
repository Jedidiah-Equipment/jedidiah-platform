import type { JobActivityItem } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { formatJobActivityDayLabel, groupJobActivityByDay } from './job-activity-timeline.js';

const NOW = new Date('2026-08-17T12:00:00');

describe('groupJobActivityByDay', () => {
  it('opens one heading per calendar day, in the order the feed delivered it', () => {
    const groups = groupJobActivityByDay(
      [
        buildItem('2026-08-17T10:42:00'),
        buildItem('2026-08-17T08:23:00'),
        buildItem('2026-08-16T16:48:00'),
        buildItem('2026-08-14T15:22:00'),
      ],
      NOW,
    );

    expect(groups.map((group) => group.day)).toEqual(['2026-08-17', '2026-08-16', '2026-08-14']);
    expect(groups.map((group) => group.items.length)).toEqual([2, 1, 1]);
  });

  // A page boundary can land mid-day, and a second "Today" heading further down would read as a
  // second day rather than as more of the one already open.
  it('keeps a day whole when the next page continues it', () => {
    const firstPage = [buildItem('2026-08-17T10:42:00')];
    const secondPage = [buildItem('2026-08-17T09:17:00'), buildItem('2026-08-16T16:48:00')];

    const groups = groupJobActivityByDay([...firstPage, ...secondPage], NOW);

    expect(groups.map((group) => group.day)).toEqual(['2026-08-17', '2026-08-16']);
  });

  it('has nothing to group when the feed is empty', () => {
    expect(groupJobActivityByDay([], NOW)).toEqual([]);
  });
});

describe('formatJobActivityDayLabel', () => {
  it.each([
    ['2026-08-17T10:42:00', 'Today · Mon 17 Aug'],
    ['2026-08-16T16:48:00', 'Yesterday · Sun 16 Aug'],
    ['2026-08-14T15:22:00', 'Fri 14 Aug'],
    // Once the year is no longer the obvious one, the weekday alone would place the entry wrongly.
    ['2025-08-14T15:22:00', 'Thu 14 Aug 2025'],
  ])('labels %s as %s', (occurredAt, expected) => {
    expect(formatJobActivityDayLabel(occurredAt, NOW)).toBe(expected);
  });
});

function buildItem(occurredAt: string): JobActivityItem {
  return {
    type: 'job-completed',
    id: '20000000-0000-4000-8000-000000000000' as JobActivityItem['id'],
    occurredAt: occurredAt as JobActivityItem['occurredAt'],
    actor: null,
    completedOn: '2026-08-10' as Extract<JobActivityItem, { type: 'job-completed' }>['completedOn'],
    job: {
      id: '30000000-0000-4000-8000-000000000000' as JobActivityItem['job']['id'],
      code: 'JOB-00042' as JobActivityItem['job']['code'],
      customerCompanyName: 'Acme Mining',
      displayName: 'Cane 8 ton',
      offeringKind: 'product',
      thumbnailDataUrl: null,
    },
  };
}
