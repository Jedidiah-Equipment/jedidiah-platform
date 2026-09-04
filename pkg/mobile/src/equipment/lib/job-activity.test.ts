import type { JobActivityItem } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import { formatJobActivityDayLabel, groupJobActivityByDay } from './job-activity';

const NOW = new Date('2026-08-17T12:00:00');

describe('groupJobActivityByDay', () => {
  it('groups consecutive feed entries without changing their order', () => {
    const sections = groupJobActivityByDay(
      [buildItem('2026-08-17T10:42:00'), buildItem('2026-08-17T08:23:00'), buildItem('2026-08-16T16:48:00')],
      NOW,
    );

    expect(sections.map((section) => section.day)).toEqual(['2026-08-17', '2026-08-16']);
    expect(sections.map((section) => section.data.length)).toEqual([2, 1]);
  });
});

describe('formatJobActivityDayLabel', () => {
  it.each([
    ['2026-08-17T10:42:00', 'Today · Mon 17 Aug'],
    ['2026-08-16T16:48:00', 'Yesterday · Sun 16 Aug'],
    ['2026-08-14T15:22:00', 'Fri 14 Aug'],
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
