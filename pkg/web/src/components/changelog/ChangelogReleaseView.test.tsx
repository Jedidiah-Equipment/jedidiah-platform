import type { Changelog } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import { ChangelogReleaseView } from './ChangelogReleaseView.js';

const release = {
  releasedAt: '2026-07-01T09:00:00.000Z',
  sections: [
    { surface: 'mobile', entries: [{ title: 'Offline mode', description: 'Works without signal.' }] },
    { surface: 'app', entries: [{ title: 'Faster search', description: 'Results load instantly.' }] },
  ],
} as Changelog;

test('renders the release date', () => {
  const markup = renderToStaticMarkup(<ChangelogReleaseView changelog={release} />);
  expect(markup).toContain('Jul 1, 2026');
});

test('groups entries under Surface labels in canonical order', () => {
  const markup = renderToStaticMarkup(<ChangelogReleaseView changelog={release} />);

  expect(markup).toContain('App');
  expect(markup).toContain('Mobile');
  expect(markup).toContain('Faster search');
  expect(markup).toContain('Offline mode');
  // App is ordered before Mobile even though the release lists Mobile first.
  expect(markup.indexOf('App')).toBeLessThan(markup.indexOf('Mobile'));
});

test('omits Surfaces the release does not touch', () => {
  const markup = renderToStaticMarkup(<ChangelogReleaseView changelog={release} />);
  expect(markup).not.toContain('Lander');
});
