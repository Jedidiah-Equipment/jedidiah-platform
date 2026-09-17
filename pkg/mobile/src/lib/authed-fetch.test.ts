import { describe, expect, it, vi } from 'vitest';

vi.mock('./api-base-url', () => ({ apiBaseUrl: 'https://api.jedidiah.test' }));
vi.mock('./auth', () => ({ sessionCookieHeader: async () => null }));
vi.mock('./observability', () => ({ addBreadcrumb: vi.fn() }));

import { apiRoutePattern } from './authed-fetch';

describe('apiRoutePattern', () => {
  it.each([
    ['/api/jobs/job-secret/documents/document-secret/download', '/api/jobs/[jobId]/documents/[documentId]/download'],
    [
      '/api/quotes/quote-secret/documents/document-secret/download',
      '/api/quotes/[quoteId]/documents/[documentId]/download',
    ],
    [
      '/api/products/product-secret/documents/document-secret/download',
      '/api/products/[productId]/documents/[documentId]/download',
    ],
    ['/api/products/product-secret/brochure-preview', '/api/products/[productId]/brochure-preview'],
    ['/api/products/product-secret/images/hero/download', '/api/products/[productId]/images/[slot]/download'],
  ])('redacts record identifiers in %s', (path, expected) => {
    expect(apiRoutePattern(path)).toBe(expected);
  });

  it('keeps fixed routes unchanged', () => {
    expect(apiRoutePattern('/api/contracting/readings')).toBe('/api/contracting/readings');
  });
});
