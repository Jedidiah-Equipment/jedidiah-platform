import { describe, expect, it } from 'vitest';

import { getInternalRouterHref } from './assistant-markdown-link.js';

const ORIGIN = 'https://jedidiah.test';

describe('getInternalRouterHref', () => {
  it('returns relative internal paths unchanged', () => {
    expect(getInternalRouterHref('/jobs/job-id', ORIGIN)).toBe('/jobs/job-id');
  });

  it('preserves search params and hash fragments', () => {
    expect(getInternalRouterHref('/jobs/job-id?tab=events#latest', ORIGIN)).toBe('/jobs/job-id?tab=events#latest');
  });

  it('normalizes same-origin absolute urls to app hrefs', () => {
    expect(getInternalRouterHref('https://jedidiah.test/quotes/quote-id', ORIGIN)).toBe('/quotes/quote-id');
  });

  it('returns null for external urls', () => {
    expect(getInternalRouterHref('https://example.com/jobs/job-id', ORIGIN)).toBeNull();
  });

  it('returns null for dangerous protocols', () => {
    expect(getInternalRouterHref('javascript:alert(1)', ORIGIN)).toBeNull();
    expect(getInternalRouterHref('data:text/html,hello', ORIGIN)).toBeNull();
  });

  it('returns null for missing hrefs', () => {
    expect(getInternalRouterHref(undefined, ORIGIN)).toBeNull();
    expect(getInternalRouterHref('', ORIGIN)).toBeNull();
  });
});
