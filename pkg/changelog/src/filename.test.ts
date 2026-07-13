import { describe, expect, it } from 'vitest';

import { deriveChangelogBasename } from './filename.js';

const releasedAt = '2026-07-13T09:30:00.000Z';

describe('deriveChangelogBasename', () => {
  it('uses the release date when the slot is free', () => {
    expect(deriveChangelogBasename(releasedAt, [])).toBe('2026-07-13');
  });

  it('disambiguates a second release on the same day', () => {
    expect(deriveChangelogBasename(releasedAt, ['2026-07-13'])).toBe('2026-07-13-2');
  });

  it('increments past every taken slot on the same day', () => {
    expect(deriveChangelogBasename(releasedAt, ['2026-07-13', '2026-07-13-2'])).toBe('2026-07-13-3');
  });

  it('ignores taken slots from other days', () => {
    expect(deriveChangelogBasename(releasedAt, ['2026-07-12', '2026-07-14'])).toBe('2026-07-13');
  });
});
