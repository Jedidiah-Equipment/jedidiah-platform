import { describe, expect, test } from 'vitest';

import { hasUnreadActivity } from './job-activity.js';

describe('hasUnreadActivity', () => {
  const lastActivitySeen = '2026-08-18T08:00:00.000Z';

  test('reports a newer activity entry as unread', () => {
    expect(hasUnreadActivity({ lastActivitySeen, latestActivityAt: '2026-08-18T08:00:00.001Z' })).toBe(true);
  });

  test('does not report an equal or older entry as unread', () => {
    expect(hasUnreadActivity({ lastActivitySeen, latestActivityAt: lastActivitySeen })).toBe(false);
    expect(hasUnreadActivity({ lastActivitySeen, latestActivityAt: '2026-08-18T07:59:59.999Z' })).toBe(false);
  });

  test('does not report an empty feed as unread', () => {
    expect(hasUnreadActivity({ lastActivitySeen, latestActivityAt: null })).toBe(false);
  });
});
