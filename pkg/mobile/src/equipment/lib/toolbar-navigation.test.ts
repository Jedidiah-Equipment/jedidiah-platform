import { describe, expect, test } from 'vitest';

import {
  MAIN_TAB_PARENTS,
  resolveAssistantParent,
  resolveDocumentParent,
  storesMovementReturnTo,
} from './toolbar-navigation';

describe('toolbar navigation', () => {
  test('resolves Assistant origins and falls back to Jobs', () => {
    expect(resolveAssistantParent('/equipment/stores')).toBe(MAIN_TAB_PARENTS.stores);
    expect(resolveAssistantParent('/not-a-tab')).toBe(MAIN_TAB_PARENTS.jobs);
    expect(resolveAssistantParent(undefined)).toBe(MAIN_TAB_PARENTS.jobs);
  });

  test('returns documents to their owning detail page', () => {
    expect(resolveDocumentParent({ productId: 'product-1' })).toMatchObject({
      kind: 'product',
      returnTo: { pathname: '/equipment/products/[productId]', params: { productId: 'product-1' } },
    });
    expect(resolveDocumentParent({ jobId: 'job-1' })).toMatchObject({
      kind: 'job',
      returnTo: { pathname: '/equipment/jobs/[jobId]', params: { jobId: 'job-1' } },
    });
    expect(resolveDocumentParent({ quoteId: 'quote-1' })).toMatchObject({
      kind: 'quote',
      returnTo: { pathname: '/equipment/quotes/[quoteId]', params: { quoteId: 'quote-1' } },
    });
    expect(resolveDocumentParent({})).toBeNull();
  });

  test('returns a stores movement to its close-out Job, else its Part', () => {
    expect(storesMovementReturnTo({ jobId: 'job-1', partCode: 'P-1' })).toEqual({
      pathname: '/equipment/stores/close-out/[jobId]',
      params: { jobId: 'job-1' },
    });
    expect(storesMovementReturnTo({ partCode: 'P-1' })).toEqual({
      pathname: '/equipment/stores/parts/[partCode]',
      params: { partCode: 'P-1' },
    });
  });
});
