import { describe, expect, test } from 'vitest';

import {
  createCustomerAppHref,
  createJobAppHref,
  createProductAppHref,
  createProductBrochureDownloadHref,
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
    [createQuoteDocumentDownloadHref('q1', 'd1'), { kind: 'quote-document', quoteId: 'q1', documentId: 'd1' }],
    [createProductBrochureDownloadHref('p1'), { kind: 'product-brochure', productId: 'p1' }],
  ])('round-trips the factory href %s through the parser', (href, expected) => {
    expect(parseInternalAppHref(href)).toEqual(expected);
  });

  test.each([
    'https://example.com/quotes/q1/edit',
    '//example.com/quotes/q1/edit',
    '/quotes/q1',
    '/products/../edit',
    '/quotes/%2e%2e/edit',
    '/api/quotes/q1/documents/../download',
    '/products/p1/edit?from=assistant',
  ])('rejects an unsupported or unsafe href: %s', (href) => {
    expect(parseInternalAppHref(href)).toBeNull();
  });

  test('retains the internal absolute-path validation contract', () => {
    expect(InternalAppHref.parse('/products/p1/edit')).toBe('/products/p1/edit');
    expect(() => InternalAppHref.parse('/\\example.com/products/p1')).toThrow();
    expect(() => InternalAppHref.parse('/products/p1\nexample')).toThrow();
  });
});
