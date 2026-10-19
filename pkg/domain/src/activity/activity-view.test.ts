import { DateIso } from '@pkg/schema';
import { describe, expect, test } from 'vitest';
import { activityViewFor, advanceActivityView, advancesActivityView, hasUnreadActivity } from './activity-view.js';

const iso = (value: string) => DateIso.parse(value);
const createdAt = iso('2026-10-01T08:00:00.000Z');

describe('the per-business Activity View', () => {
  test('reads a business that was never acknowledged as the account’s creation', () => {
    expect(activityViewFor({}, 'contracting', createdAt)).toBe(createdAt);
    expect(activityViewFor({ equipment: iso('2026-10-05T08:00:00.000Z') }, 'contracting', createdAt)).toBe(createdAt);
  });

  test('advances one business forward only, leaving the other untouched', () => {
    const map = { equipment: iso('2026-10-05T08:00:00.000Z') };
    const seen = iso('2026-10-06T09:00:00.000Z');

    expect(advanceActivityView(map, 'contracting', seen, createdAt)).toEqual({ ...map, contracting: seen });
    expect(advanceActivityView(map, 'equipment', iso('2026-10-04T08:00:00.000Z'), createdAt)).toBe(map);
    expect(advanceActivityView({}, 'contracting', iso('2026-09-30T08:00:00.000Z'), createdAt)).toEqual({});
  });
});

describe('which view of the feed advances the Activity View', () => {
  test.each([
    { view: 'the unfiltered, unsearched, unscoped feed', filter: 'all', search: '', scoped: false, advances: true },
    { view: 'a filter tab', filter: 'notes', search: '', scoped: false, advances: false },
    { view: 'a search', filter: 'all', search: 'gearbox', scoped: false, advances: false },
    { view: 'one record’s own thread', filter: 'all', search: '', scoped: true, advances: false },
  ])('$view → $advances', ({ filter, search, scoped, advances }) => {
    expect(advancesActivityView({ filter, search, scoped })).toBe(advances);
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
