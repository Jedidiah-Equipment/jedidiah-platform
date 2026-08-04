import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { docsConfig } from './config';
import { CONTENT_DIR, listContentPages } from './pages';

const sidebar = docsConfig.themeConfig?.sidebar;
const sections = Array.isArray(sidebar) ? sidebar : [];

describe('docs site config', () => {
  it('builds the site from the content directory into the package dist directory', () => {
    expect(docsConfig.srcDir).toBe('content');
    expect(docsConfig.outDir).toBe('dist');
  });

  it('marks every page noindex', () => {
    expect(docsConfig.head).toContainEqual(['meta', { name: 'robots', content: 'noindex, nofollow' }]);
  });

  it('enables the built-in local search', () => {
    expect(docsConfig.themeConfig?.search).toEqual({ provider: 'local' });
  });

  it('fails the build on a dead internal link', () => {
    expect(docsConfig.ignoreDeadLinks).toBeFalsy();
  });
});

describe('docs site navigation', () => {
  const listed = sections.flatMap((section) => section.items?.map((item) => item.link) ?? []);

  it('is built from the pages on disk rather than a hand-kept list', () => {
    const existing = listContentPages();
    for (const link of listed) {
      expect(existing).toContain(link);
    }
  });

  it('lists every content page except the landing page', () => {
    for (const link of listContentPages()) {
      if (link === '/') continue;
      expect(listed).toContain(link);
    }
  });
});

describe('robots.txt', () => {
  it('disallows every crawler', () => {
    const robots = readFileSync(join(CONTENT_DIR, 'public', 'robots.txt'), 'utf8');
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Disallow: \/$/m);
  });
});
