import { describe, expect, it } from 'vitest';

import { selectStaleChangelogs } from './prune.js';

const now = new Date('2026-07-13T12:00:00.000Z');

describe('selectStaleChangelogs', () => {
  it('keeps a changelog released today', () => {
    const files = [{ path: 'a.json', releasedAt: '2026-07-13T09:00:00.000Z' }];
    expect(selectStaleChangelogs(files, now)).toEqual([]);
  });

  it('keeps a changelog exactly 30 calendar days old', () => {
    const files = [{ path: 'a.json', releasedAt: '2026-06-13T09:00:00.000Z' }];
    expect(selectStaleChangelogs(files, now)).toEqual([]);
  });

  it('prunes a changelog 31 calendar days old', () => {
    const files = [{ path: 'old.json', releasedAt: '2026-06-12T09:00:00.000Z' }];
    expect(selectStaleChangelogs(files, now)).toEqual(['old.json']);
  });

  it('returns only the stale paths from a mixed set', () => {
    const files = [
      { path: 'fresh.json', releasedAt: '2026-07-01T09:00:00.000Z' },
      { path: 'stale.json', releasedAt: '2026-05-01T09:00:00.000Z' },
      { path: 'ancient.json', releasedAt: '2025-01-01T09:00:00.000Z' },
    ];
    expect(selectStaleChangelogs(files, now)).toEqual(['stale.json', 'ancient.json']);
  });

  it('honours a custom max age', () => {
    // Released 8 calendar days before `now`.
    const files = [{ path: 'a.json', releasedAt: '2026-07-05T09:00:00.000Z' }];
    expect(selectStaleChangelogs(files, now, 10)).toEqual([]);
    expect(selectStaleChangelogs(files, now, 7)).toEqual(['a.json']);
  });
});
