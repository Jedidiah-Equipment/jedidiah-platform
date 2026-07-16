import type { Changelog } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import { ChangelogReleaseView } from './ChangelogReleaseView.js';

const release = {
  releasedAt: '2026-07-01T09:00:00.000Z',
  sections: [
    { surface: 'mobile', entries: [{ title: 'Offline mode', description: 'Works without signal.' }] },
    {
      surface: 'app',
      entries: [
        { title: 'Faster search', description: 'Results load instantly.' },
        { title: 'Clearer filters', description: 'Filters are easier to scan.' },
        { title: 'Better forms', description: 'Forms group related details.' },
        { title: 'Tidier controls', description: 'Actions take up less space.' },
      ],
    },
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
  expect(markup).not.toContain('Offline mode');
  // App is ordered before Mobile even though the release lists Mobile first.
  expect(markup.indexOf('App')).toBeLessThan(markup.indexOf('Mobile'));
});

test('summarizes the release and limits the initially expanded Surface to three entries', () => {
  const markup = renderToStaticMarkup(<ChangelogReleaseView changelog={release} />);

  expect(markup).toContain('5 improvements across 2 areas');
  expect(markup).toContain('1 more App improvement');
  expect(markup).not.toContain('Tidier controls');
});

test('uses user-facing Website language for the Lander Surface', () => {
  const landerRelease = {
    ...release,
    sections: [{ surface: 'lander', entries: [{ title: 'Public catalog', description: 'Browse products.' }] }],
  } as Changelog;
  const markup = renderToStaticMarkup(<ChangelogReleaseView changelog={landerRelease} />);

  expect(markup).toContain('Website');
  expect(markup).not.toContain('Lander');
});

test('omits Surfaces the release does not touch', () => {
  const markup = renderToStaticMarkup(<ChangelogReleaseView changelog={release} />);
  expect(markup).not.toContain('Lander');
});
