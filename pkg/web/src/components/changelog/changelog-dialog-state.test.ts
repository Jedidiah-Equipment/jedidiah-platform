import type { Changelog } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import {
  acknowledgeableReleasedAt,
  type ChangelogDialogState,
  orderedChangelogSections,
  primaryControlLabel,
  reduceChangelogControl,
  shouldOpenChangelogDialog,
} from './changelog-dialog-state.js';

function changelog(releasedAt: string, sections: Changelog['sections'] = defaultSections()): Changelog {
  return { releasedAt, sections } as Changelog;
}

function defaultSections(): Changelog['sections'] {
  return [
    { surface: 'app', entries: [{ title: 'A change', description: 'A user-visible change.' }] },
  ] as Changelog['sections'];
}

// Oldest-first, as the API returns them.
const oldest = changelog('2026-05-01T00:00:00.000Z');
const middle = changelog('2026-06-01T00:00:00.000Z');
const newest = changelog('2026-07-01T00:00:00.000Z');
const releases = [oldest, middle, newest];

describe('shouldOpenChangelogDialog', () => {
  test('does not open when there are no unseen changelogs', () => {
    expect(shouldOpenChangelogDialog([])).toBe(false);
  });

  test('opens when at least one unseen changelog exists', () => {
    expect(shouldOpenChangelogDialog([oldest])).toBe(true);
  });
});

describe('primaryControlLabel', () => {
  test('is "Next" while earlier pages remain', () => {
    expect(primaryControlLabel(0, releases.length)).toBe('Next');
    expect(primaryControlLabel(1, releases.length)).toBe('Next');
  });

  test('becomes "Done" on the last page', () => {
    expect(primaryControlLabel(2, releases.length)).toBe('Done');
  });

  test('is "Done" for a single release', () => {
    expect(primaryControlLabel(0, 1)).toBe('Done');
  });
});

describe('reduceChangelogControl', () => {
  function openOnPage(pageIndex: number): ChangelogDialogState {
    return { dismissed: false, open: true, pageIndex };
  }

  test('Next advances the page and marks nothing seen', () => {
    expect(reduceChangelogControl(openOnPage(0), 'primary', releases)).toEqual({
      markSeenReleasedAt: null,
      state: { dismissed: false, open: true, pageIndex: 1 },
    });
    expect(reduceChangelogControl(openOnPage(1), 'primary', releases)).toEqual({
      markSeenReleasedAt: null,
      state: { dismissed: false, open: true, pageIndex: 2 },
    });
  });

  test('Done (primary on the last page) marks the newest release seen and closes for the session', () => {
    expect(reduceChangelogControl(openOnPage(2), 'primary', releases)).toEqual({
      markSeenReleasedAt: newest.releasedAt,
      state: { dismissed: true, open: false, pageIndex: 2 },
    });
  });

  test('Skip marks the newest release seen and closes from any page', () => {
    expect(reduceChangelogControl(openOnPage(0), 'skip', releases)).toEqual({
      markSeenReleasedAt: newest.releasedAt,
      state: { dismissed: true, open: false, pageIndex: 0 },
    });
  });

  test('Close dismisses for the session without marking anything seen', () => {
    expect(reduceChangelogControl(openOnPage(1), 'close', releases)).toEqual({
      markSeenReleasedAt: null,
      state: { dismissed: true, open: false, pageIndex: 1 },
    });
  });
});

describe('acknowledgeableReleasedAt', () => {
  test('is the newest release regardless of input order', () => {
    expect(acknowledgeableReleasedAt([middle, newest, oldest])).toBe(newest.releasedAt);
  });

  test('is null for an empty set', () => {
    expect(acknowledgeableReleasedAt([])).toBeNull();
  });
});

describe('orderedChangelogSections', () => {
  test('orders sections App, Lander, Mobile regardless of input order', () => {
    const entry = { title: 't', description: 'd' };
    const release = changelog('2026-07-01T00:00:00.000Z', [
      { surface: 'mobile', entries: [entry] },
      { surface: 'app', entries: [entry] },
      { surface: 'lander', entries: [entry] },
    ] as Changelog['sections']);

    expect(orderedChangelogSections(release).map((section) => section.surface)).toEqual(['app', 'lander', 'mobile']);
  });

  test('omits Surfaces with no section', () => {
    const entry = { title: 't', description: 'd' };
    const release = changelog('2026-07-01T00:00:00.000Z', [
      { surface: 'mobile', entries: [entry] },
      { surface: 'app', entries: [entry] },
    ] as Changelog['sections']);

    expect(orderedChangelogSections(release).map((section) => section.surface)).toEqual(['app', 'mobile']);
  });
});
