import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { docsConfig } from './config';
import { CONTENT_DIR, listContentPages } from './pages';
import { buildSidebar, DOCS_SECTIONS } from './sidebar';

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

  it('is the declared structure narrowed by the pages on disk, not a hand-kept list', () => {
    expect(sidebar).toEqual(buildSidebar(DOCS_SECTIONS, listContentPages()));
  });

  it('lists every content page except the landing page', () => {
    for (const link of listContentPages()) {
      if (link === '/') continue;
      expect(listed).toContain(link);
    }
  });
});

describe('robots.txt', () => {
  // The `noindex` head tag above is the directive that keeps this site out of search results, and a crawler
  // has to be able to fetch a page to read it. Blocking here would strand any externally-linked URL in the
  // index permanently, which is the opposite of the intent.
  it('allows every crawler, so the noindex on each page is actually read', () => {
    const robots = readFileSync(join(CONTENT_DIR, 'public', 'robots.txt'), 'utf8');
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
  });

  it('carries no Disallow rule, in the file body or a stray comment', () => {
    const robots = readFileSync(join(CONTENT_DIR, 'public', 'robots.txt'), 'utf8');
    expect(robots).not.toMatch(/^\s*Disallow:/im);
  });
});
