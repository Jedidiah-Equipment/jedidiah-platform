import { DateIso } from '@pkg/schema';
import { JobActivityItem } from '@pkg/schema/equipment';
import { afterEach, expect, test, vi } from 'vitest';

import { groupJobActivityByDay } from './job-activity.js';

afterEach(() => vi.unstubAllEnvs());

test('keeps a day whole when the next page continues it', () => {
  const firstPage = [buildItem('2026-08-17T10:42:00')];
  const secondPage = [buildItem('2026-08-17T09:17:00'), buildItem('2026-08-16T16:48:00')];

  const groups = groupJobActivityByDay([...firstPage, ...secondPage], DateIso.parse(new Date('2026-08-17T12:00:00')));

  expect(groups).toEqual([
    { day: '2026-08-17', label: 'Today · Mon 17 Aug', items: [firstPage[0], secondPage[0]] },
    { day: '2026-08-16', label: 'Yesterday · Sun 16 Aug', items: [secondPage[1]] },
  ]);
});

test('keeps User Feedback and events in delivered order without copying or changing them', () => {
  const feedback = Object.freeze(buildItem('2026-08-17T08:00:00', true));
  const event = Object.freeze(buildItem('2026-08-17T10:00:00'));
  const items = Object.freeze([feedback, event]);

  const groups = groupJobActivityByDay(items, DateIso.parse(new Date('2026-08-17T12:00:00')));

  expect(groups).toHaveLength(1);
  expect(groups[0]?.items[0]).toBe(feedback);
  expect(groups[0]?.items[1]).toBe(event);
});

test('has nothing to group when the feed is empty', () => {
  expect(groupJobActivityByDay([])).toEqual([]);
});

test.each([
  ['2026-08-17T10:42:00', '2026-08-17T12:00:00', 'Today · Mon 17 Aug'],
  ['2026-08-16T16:48:00', '2026-08-17T12:00:00', 'Yesterday · Sun 16 Aug'],
  ['2026-08-14T15:22:00', '2026-08-17T12:00:00', 'Fri 14 Aug'],
  ['2025-08-14T15:22:00', '2026-08-17T12:00:00', 'Thu 14 Aug 2025'],
  ['2025-12-31T23:59:00', '2026-01-01T00:01:00', 'Yesterday · Wed 31 Dec 2025'],
])('labels the day of %s relative to %s', (occurredAt, now, label) => {
  expect(groupJobActivityByDay([buildItem(occurredAt)], DateIso.parse(new Date(now)))[0]?.label).toBe(label);
});

test.each([
  ['UTC', ['2026-08-18', '2026-08-17']],
  ['America/New_York', ['2026-08-17']],
  ['Africa/Johannesburg', ['2026-08-18']],
])('splits days at the reader’s midnight in %s', (timeZone, days) => {
  vi.stubEnv('TZ', timeZone);
  const items = [buildItem('2026-08-18T00:15:00.000Z'), buildItem('2026-08-17T23:45:00.000Z')];

  expect(groupJobActivityByDay(items).map((group) => group.day)).toEqual(days);
});

test.each([
  ['2026-03-08T00:15:00-05:00', '2026-03-09T00:15:00-04:00', 'Yesterday · Sun 8 Mar'],
  ['2026-11-01T00:15:00-04:00', '2026-11-02T00:15:00-05:00', 'Yesterday · Sun 1 Nov'],
])('uses calendar days across daylight saving changes: %s', (occurredAt, now, label) => {
  vi.stubEnv('TZ', 'America/New_York');

  expect(groupJobActivityByDay([buildItem(occurredAt)], DateIso.parse(new Date(now)))[0]?.label).toBe(label);
});

test('keeps date-only activity and clock inputs on their local calendar day', () => {
  vi.stubEnv('TZ', 'America/New_York');
  const item = { ...buildItem('2026-08-18T12:00:00.000Z'), occurredAt: DateIso.parse('2026-08-18') };

  expect(groupJobActivityByDay([item], DateIso.parse('2026-08-18'))).toEqual([
    { day: '2026-08-18', label: 'Today · Tue 18 Aug', items: [item] },
  ]);
});

function buildItem(occurredAt: string, feedback = false): JobActivityItem {
  return JobActivityItem.parse({
    actor: null,
    id: '20000000-0000-4000-8000-000000000000',
    job: {
      code: 'JOB-00042',
      customerCompanyName: 'Acme Mining',
      displayName: 'Cane 8 ton',
      id: '30000000-0000-4000-8000-000000000000',
      offeringKind: 'product',
      thumbnailDataUrl: null,
    },
    occurredAt: new Date(occurredAt).toISOString(),
    ...(feedback
      ? {
          type: 'general-feedback',
          feedback: {
            submitter: { email: 'thabo@example.com', id: 'user-1', name: 'Thabo Mokoena', thumbnailDataUrl: null },
            text: 'Paint bay handover was missed.',
          },
        }
      : { type: 'job-created' }),
  });
}
