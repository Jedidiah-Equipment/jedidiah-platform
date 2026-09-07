import { DateIso } from '@pkg/schema';
import { JobChangeActivityItem } from '@pkg/schema/equipment';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { hasUnreadActivity, presentJobActivityEvent } from './job-activity.js';

afterEach(() => vi.unstubAllEnvs());

describe('presentJobActivityEvent', () => {
  test.each([
    [{ type: 'job-created' }, 'created this Job', null],
    [
      { type: 'job-description-updated', description: 'Fit the heavy-duty boom.' },
      'changed the Job description',
      'Fit the heavy-duty boom.',
    ],
    [{ type: 'job-description-updated', description: null }, 'cleared the Job description', null],
    [{ type: 'job-completed', completedOn: '2026-08-18' }, 'completed this Job', null],
    [{ type: 'job-completed', completedOn: '2026-08-17' }, 'completed this Job', 'Aug 17, 2026'],
    [
      { type: 'job-document-added', document: { contentType: 'application/pdf', filename: 'handover.pdf' } },
      'added a document',
      'handover.pdf',
    ],
  ])('presents the Job Event %j', (payload, sentence, detail) => {
    expect(presentJobActivityEvent(buildChangeItem(payload))).toEqual({
      actorName: 'Thabo',
      detail,
      sentence,
      tone: 'purple',
    });
  });

  test('attributes events without an actor to System', () => {
    expect(presentJobActivityEvent(buildChangeItem({ type: 'job-created', actor: null })).actorName).toBe('System');
  });

  test.each([
    ['started', 'started Fabrication work', null, []],
    ['completed', 'completed Fabrication work', 'Fiona Fabricator', ['Fiona Fabricator']],
    [
      'corrected',
      'corrected Fabrication work times',
      'Aug 1, 2026 → Aug 4, 2026 · Fiona Fabricator',
      ['Fiona Fabricator'],
    ],
    ['cleared', 'cleared Fabrication work times', null, []],
  ])('presents %s Work Times from the snapshotted state', (action, sentence, detail, crew) => {
    const item = buildChangeItem({
      type: 'job-work-time-updated',
      action,
      department: 'fabrication',
      timing:
        action === 'cleared'
          ? null
          : {
              completedAt: action === 'started' ? null : '2026-08-04T12:00:00.000Z',
              crew,
              startedAt: '2026-08-01T12:00:00.000Z',
            },
    });

    expect(presentJobActivityEvent(item)).toEqual({ actorName: 'Thabo', detail, sentence, tone: 'blue' });
  });

  test.each([
    [null, [], 'Aug 18, 2026'],
    [null, ['Fiona Fabricator', 'Sam Smith'], 'Aug 18, 2026 · Fiona Fabricator, Sam Smith'],
    ['2026-08-19T12:00:00.000Z', [], 'Aug 18, 2026 → Aug 19, 2026'],
  ])('keeps the resulting corrected span and crew: %j, %j', (completedAt, crew, detail) => {
    const item = buildChangeItem({
      type: 'job-work-time-updated',
      action: 'corrected',
      department: 'assembly',
      timing: { completedAt, crew, startedAt: '2026-08-18T12:00:00.000Z' },
    });

    expect(presentJobActivityEvent(item)).toMatchObject({ sentence: 'corrected Assembly work times', detail });
  });

  test.each(['UTC', 'America/New_York', 'Africa/Johannesburg'])(
    'compares completion dates to the plant day when the reader is in %s',
    (timeZone) => {
      vi.stubEnv('TZ', timeZone);
      const payload = { type: 'job-completed', occurredAt: '2026-08-18T22:30:00.000Z' };

      expect(presentJobActivityEvent(buildChangeItem({ ...payload, completedOn: '2026-08-19' })).detail).toBeNull();
      expect(presentJobActivityEvent(buildChangeItem({ ...payload, completedOn: '2026-08-18' })).detail).toBe(
        'Aug 18, 2026',
      );
    },
  );
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

function buildChangeItem(payload: Record<string, unknown>): JobChangeActivityItem {
  return JobChangeActivityItem.parse({
    actor: { email: 'thabo@example.com', id: 'user-1', name: 'Thabo Mokoena', thumbnailDataUrl: null },
    id: '20000000-0000-4000-8000-000000000000',
    job: {
      code: 'JOB-00042',
      customerCompanyName: 'Acme Mining',
      displayName: 'Cane 8 ton',
      id: '30000000-0000-4000-8000-000000000000',
      offeringKind: 'product',
      thumbnailDataUrl: null,
    },
    occurredAt: '2026-08-18T12:00:00.000Z',
    ...payload,
  });
}
