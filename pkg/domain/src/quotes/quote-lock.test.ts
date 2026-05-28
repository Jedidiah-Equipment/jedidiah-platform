import { describe, expect, it } from 'vitest';

import { assertQuoteEditable } from './quote-lock.js';

describe('assertQuoteEditable', () => {
  it('allows frozen and logistics fields before a quote has a job', () => {
    expect(
      assertQuoteEditable({
        changedFields: ['discount', 'selectedAssemblies', 'notes'],
        hasJob: false,
      }),
    ).toEqual({ allowed: true });
  });

  it('rejects frozen fields after a quote has a job', () => {
    expect(
      assertQuoteEditable({
        changedFields: ['discount'],
        hasJob: true,
      }),
    ).toEqual({
      allowed: false,
      reason: 'Quote is locked because it already has a Job; discount cannot be changed.',
    });
  });

  it('rejects unknown changed fields after a quote has a job', () => {
    expect(
      assertQuoteEditable({
        changedFields: ['futureCommercialField'],
        hasJob: true,
      }),
    ).toEqual({
      allowed: false,
      reason: 'Quote is locked because it already has a Job; futureCommercialField cannot be changed.',
    });
  });

  it('allows logistics and free-text fields after a quote has a job', () => {
    expect(
      assertQuoteEditable({
        changedFields: ['validUntil', 'preferredDeliveryDate', 'plannedDeliveryDate', 'notes', 'paymentTerms'],
        hasJob: true,
      }),
    ).toEqual({ allowed: true });
  });
});
