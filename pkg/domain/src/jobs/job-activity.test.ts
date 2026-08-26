import { DateIso } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import { hasUnreadActivity, jobActivityEventTone, jobWorkTimeActivityDetail } from './job-activity.js';

test('keeps Job Event and Work Time tones consistent across clients', () => {
  expect(jobActivityEventTone).toEqual({
    'job-completed': 'purple',
    'job-created': 'purple',
    'job-description-updated': 'purple',
    'job-document-added': 'purple',
    'job-work-time-updated': 'blue',
  });
});

describe('jobWorkTimeActivityDetail', () => {
  const startedAt = DateIso.parse('2026-08-18T08:00:00.000Z');
  const completedAt = DateIso.parse('2026-08-18T12:00:00.000Z');

  test('keeps crew context without repeating timeline dates or Work Time state', () => {
    expect(jobWorkTimeActivityDetail({ completedAt: null, crew: [], startedAt })).toBeNull();
    expect(jobWorkTimeActivityDetail({ completedAt, crew: ['Fiona Fabricator'], startedAt })).toBe('Fiona Fabricator');
    expect(jobWorkTimeActivityDetail({ completedAt: null, crew: ['Fiona Fabricator'], startedAt })).toBe(
      'Fiona Fabricator',
    );
  });

  test('omits detail when dates were the only additional facts', () => {
    expect(jobWorkTimeActivityDetail({ completedAt, crew: [], startedAt })).toBeNull();
    expect(jobWorkTimeActivityDetail(null)).toBeNull();
  });
});

describe('hasUnreadActivity', () => {
  const lastActivitySeen = DateIso.parse('2026-08-18T08:00:00.000Z');

  test('reports a newer activity entry as unread', () => {
    expect(
      hasUnreadActivity({
        lastActivitySeen,
        latestActivityAt: DateIso.parse('2026-08-18T08:00:00.001Z'),
      }),
    ).toBe(true);
  });

  test('does not report an equal or older entry as unread', () => {
    expect(hasUnreadActivity({ lastActivitySeen, latestActivityAt: lastActivitySeen })).toBe(false);
    expect(
      hasUnreadActivity({
        lastActivitySeen,
        latestActivityAt: DateIso.parse('2026-08-18T07:59:59.999Z'),
      }),
    ).toBe(false);
  });

  test('does not report an empty feed as unread', () => {
    expect(hasUnreadActivity({ lastActivitySeen, latestActivityAt: null })).toBe(false);
  });
});
