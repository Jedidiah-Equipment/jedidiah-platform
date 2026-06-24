import { describe, expect, test } from 'vitest';

import { SITE_URL } from '../../lib/seo.js';
import { renderRobots } from './robots.js';
import { isSiteIndexable } from './site-indexable.js';

describe('renderRobots', () => {
  test('allows all crawling and advertises the sitemap when indexable', () => {
    const body = renderRobots(true);

    expect(body).toContain('User-agent: *');
    expect(body).toContain('Allow: /');
    expect(body).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
    expect(body).not.toContain('Disallow: /');
  });

  test('disallows all crawling and omits the sitemap when not indexable', () => {
    const body = renderRobots(false);

    expect(body).toContain('User-agent: *');
    expect(body).toContain('Disallow: /');
    expect(body).not.toContain('Allow: /');
    expect(body).not.toContain('Sitemap:');
  });
});

describe('isSiteIndexable', () => {
  test('is true only in production', () => {
    expect(isSiteIndexable({ APP_ENV: 'production' })).toBe(true);
  });

  test('is false for staging, development and anything unset (fail closed)', () => {
    expect(isSiteIndexable({ APP_ENV: 'staging' })).toBe(false);
    expect(isSiteIndexable({ APP_ENV: 'development' })).toBe(false);
    expect(isSiteIndexable({})).toBe(false);
  });
});
