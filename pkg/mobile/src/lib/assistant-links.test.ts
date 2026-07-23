import { describe, expect, test, vi } from 'vitest';
import { type AssistantRouter, resolveAssistantLink } from './assistant-links';
import { PRODUCT_BROCHURE_DOCUMENT_ID } from './product-brochure';

describe('resolveAssistantLink', () => {
  test.each([
    ['/quotes/q1/edit', { pathname: '/quotes/[quoteId]', params: { quoteId: 'q1' } }],
    ['/products/p1/edit', { pathname: '/products/[productId]', params: { productId: 'p1' } }],
    ['/jobs/j1', { pathname: '/jobs/[jobId]', params: { jobId: 'j1' } }],
    [
      '/api/quotes/q1/documents/d1/download',
      { pathname: '/documents/[documentId]', params: { documentId: 'd1', quoteId: 'q1' } },
    ],
    [
      '/api/products/p1/brochure-preview',
      {
        pathname: '/documents/[documentId]',
        params: { documentId: PRODUCT_BROCHURE_DOCUMENT_ID, productId: 'p1' },
      },
    ],
  ])('maps %s to the native route', (href, expectedRoute) => {
    const push = vi.fn();
    const router = { push } as unknown as AssistantRouter;

    const navigate = resolveAssistantLink(href, router);

    expect(navigate).not.toBeNull();
    navigate?.();
    expect(push).toHaveBeenCalledWith(expectedRoute);
  });

  test.each([
    '/customers/c1/edit',
    '/quotes/q1',
    'https://example.com/quotes/q1/edit',
  ])('leaves unsupported or unrecognized hrefs as plain text: %s', (href) => {
    const router = { push: vi.fn() } as unknown as AssistantRouter;

    expect(resolveAssistantLink(href, router)).toBeNull();
  });
});
