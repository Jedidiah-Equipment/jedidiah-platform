import { describe, expect, test } from 'vitest';

import {
  bayToolbarParentLabel,
  MAIN_TAB_PARENTS,
  resolveAssistantParent,
  resolveDocumentParent,
  resolveStoresMovementParent,
} from './toolbar-navigation';

describe('toolbar navigation', () => {
  test('resolves Assistant origins and falls back to Schedule', () => {
    expect(resolveAssistantParent('/stores')).toBe(MAIN_TAB_PARENTS.stores);
    expect(resolveAssistantParent('/not-a-tab')).toBe(MAIN_TAB_PARENTS.schedule);
    expect(resolveAssistantParent(undefined)).toBe(MAIN_TAB_PARENTS.schedule);
  });

  test('returns documents to their owning detail page', () => {
    expect(resolveDocumentParent({ productId: 'product-1' })).toMatchObject({
      kind: 'product',
      parentLabel: 'Product',
      returnTo: { pathname: '/products/[productId]', params: { productId: 'product-1' } },
    });
    expect(resolveDocumentParent({ jobId: 'job-1' })).toMatchObject({
      kind: 'job',
      parentLabel: 'Job',
      returnTo: { pathname: '/jobs/[jobId]', params: { jobId: 'job-1' } },
    });
    expect(resolveDocumentParent({ quoteId: 'quote-1' })).toMatchObject({
      kind: 'quote',
      parentLabel: 'Quote',
      returnTo: { pathname: '/quotes/[quoteId]', params: { quoteId: 'quote-1' } },
    });
    expect(resolveDocumentParent({})).toBeNull();
  });

  test('preserves nested Stores and Bay parents', () => {
    expect(resolveStoresMovementParent({ jobId: 'job-1', partCode: 'P-1' })).toEqual({
      label: 'Close-out Job',
      returnTo: { pathname: '/stores/close-out/[jobId]', params: { jobId: 'job-1' } },
    });
    expect(resolveStoresMovementParent({ partCode: 'P-1' })).toEqual({
      label: 'Part',
      returnTo: { pathname: '/stores/parts/[partCode]', params: { partCode: 'P-1' } },
    });
    expect(bayToolbarParentLabel(false)).toBe('Schedule');
    expect(bayToolbarParentLabel(true)).toBe('Bay schedule');
  });
});
