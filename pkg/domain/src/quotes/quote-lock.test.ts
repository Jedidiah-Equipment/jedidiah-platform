import { describe, expect, it } from 'vitest';

import { assertQuoteEditable } from './quote-lock.js';

const editableLockedQuoteFields = [
  'notes',
  'paymentTerms',
  'plannedDeliveryDate',
  'preferredDeliveryDate',
  'validUntil',
];
const frozenLockedQuoteFields = [
  'customerId',
  'depositAmount',
  'deliveryIncluded',
  'deliveryPrice',
  'discountAmount',
  'productId',
  'quotedBasePrice',
  'salesPersonId',
  'selectedAssemblies',
  'status',
];

describe('assertQuoteEditable', () => {
  it.each([...frozenLockedQuoteFields, ...editableLockedQuoteFields])('allows %s before a quote has a job', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasJob: false,
      }),
    ).toEqual({ allowed: true });
  });

  it.each(frozenLockedQuoteFields)('rejects %s after a quote has a job', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasJob: true,
      }),
    ).toEqual({
      allowed: false,
      reason: `Quote is locked because it already has a Job; ${field} cannot be changed.`,
    });
  });

  it.each(editableLockedQuoteFields)('allows %s after a quote has a job', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasJob: true,
      }),
    ).toEqual({ allowed: true });
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
});
