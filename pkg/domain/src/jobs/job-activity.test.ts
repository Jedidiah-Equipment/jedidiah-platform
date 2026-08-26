import { DateIso, DateOnlyIso } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import {
  hasUnreadActivity,
  jobActivityEventTone,
  jobCompletionActivityDetail,
  jobWorkTimeActivityDetail,
} from './job-activity.js';

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

  test('keeps crew context without repeating routine Work Time dates or state', () => {
    expect(
      jobWorkTimeActivityDetail({ action: 'started', timing: { completedAt: null, crew: [], startedAt } }),
    ).toBeNull();
    expect(
      jobWorkTimeActivityDetail({
        action: 'completed',
        timing: { completedAt, crew: ['Fiona Fabricator'], startedAt },
      }),
    ).toBe('Fiona Fabricator');
  });

  test('keeps the resulting span when Work Times were corrected', () => {
    expect(jobWorkTimeActivityDetail({ action: 'corrected', timing: { completedAt, crew: [], startedAt } })).toBe(
      'Aug 18, 2026 → Aug 18, 2026',
    );
    expect(
      jobWorkTimeActivityDetail({
        action: 'corrected',
        timing: { completedAt: null, crew: ['Fiona Fabricator'], startedAt },
      }),
    ).toBe('Aug 18, 2026 · Fiona Fabricator');
    expect(jobWorkTimeActivityDetail({ action: 'cleared', timing: null })).toBeNull();
  });
});

describe('jobCompletionActivityDetail', () => {
  test('omits the usual completion date when the timeline already carries its day', () => {
    expect(
      jobCompletionActivityDetail({
        completedOn: DateOnlyIso.parse('2026-08-18'),
        occurredAt: DateIso.parse('2026-08-18T12:00:00.000Z'),
      }),
    ).toBeNull();
  });

  test('keeps a completion date that differs from the audit timeline day', () => {
    expect(
      jobCompletionActivityDetail({
        completedOn: DateOnlyIso.parse('2026-08-17'),
        occurredAt: DateIso.parse('2026-08-18T12:00:00.000Z'),
      }),
    ).toBe('Aug 17, 2026');
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
