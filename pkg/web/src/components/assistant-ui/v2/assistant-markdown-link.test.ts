import { describe, expect, it } from 'vitest';

import { getInternalRouterHref, resolveAssistantLinkHref } from './assistant-markdown-link.js';

const ORIGIN = 'https://jedidiah.test';

describe('resolveAssistantLinkHref', () => {
  it('points generated document paths at the API origin', () => {
    expect(
      resolveAssistantLinkHref('/api/quotes/quote-id/documents/document-id/download', 'http://localhost:7002'),
    ).toBe('http://localhost:7002/api/quotes/quote-id/documents/document-id/download');
  });

  it('leaves app and external links unchanged', () => {
    expect(resolveAssistantLinkHref('/quotes/quote-id/edit', 'http://localhost:7002')).toBe('/quotes/quote-id/edit');
    expect(resolveAssistantLinkHref('https://example.com/document.pdf', 'http://localhost:7002')).toBe(
      'https://example.com/document.pdf',
    );
  });
});

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
