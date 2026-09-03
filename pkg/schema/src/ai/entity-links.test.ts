import { describe, expect, test } from 'vitest';

import {
  createCustomerAppHref,
  createJobAppHref,
  createProductAppHref,
  createProductBrochureDownloadHref,
  createProductUnitAppHref,
  createQuoteAppHref,
  createQuoteDocumentDownloadHref,
  InternalAppHref,
  parseInternalAppHref,
} from './entity-links.js';

describe('Assistant App Links', () => {
  test.each([
    [createProductAppHref('p1'), { kind: 'product', productId: 'p1' }],
    [createCustomerAppHref('c1'), { kind: 'customer', customerId: 'c1' }],
    [createQuoteAppHref('q1'), { kind: 'quote', quoteId: 'q1' }],
    [createJobAppHref('j1'), { kind: 'job', jobId: 'j1' }],
    [createProductUnitAppHref('u1'), { kind: 'product-unit', productUnitId: 'u1' }],
    [createQuoteDocumentDownloadHref('q1', 'd1'), { kind: 'quote-document', quoteId: 'q1', documentId: 'd1' }],
    [createProductBrochureDownloadHref('p1'), { kind: 'product-brochure', productId: 'p1' }],
  ])('round-trips the factory href %s through the parser', (href, expected) => {
    expect(href.startsWith('/api/') || href.startsWith('/equipment/')).toBe(true);
    expect(parseInternalAppHref(href)).toEqual(expected);
  });

  test.each([
    'https://example.com/quotes/q1/edit',
    '//example.com/quotes/q1/edit',
    '/quotes/q1',
    '/products/../edit',
    '/quotes/%2e%2e/edit',
    '/units/u1/edit',
    '/units/%2e%2e',
    '/api/quotes/q1/documents/../download',
    '/products/p1/edit?from=assistant',
    '/products/p1/edit',
    '/customers/c1/edit',
    '/quotes/q1/edit',
    '/jobs/j1',
    '/units/u1',
  ])('rejects an unsupported or unsafe href: %s', (href) => {
    expect(parseInternalAppHref(href)).toBeNull();
  });

  test('retains the internal absolute-path validation contract', () => {
    expect(InternalAppHref.parse('/equipment/products/p1/edit')).toBe('/equipment/products/p1/edit');
    expect(() => InternalAppHref.parse('/\\example.com/products/p1')).toThrow();
    expect(() => InternalAppHref.parse('/products/p1\nexample')).toThrow();
  });
});
