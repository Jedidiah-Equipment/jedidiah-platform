import { describe, expect, it } from 'vitest';

import { assertQuoteEditable } from './quote-lock.js';

const editableLockedQuoteFields = [
  'notes',
  'documentNotes',
  'plannedDeliveryDate',
  'preferredDeliveryDate',
  'validUntil',
];
const frozenLockedQuoteFields = [
  'customerId',
  'depositPercent',
  'deliveryIncluded',
  'deliveryPrice',
  'discountPercent',
  'lineItems',
  'productId',
  'quotedBasePrice',
  'salesPersonId',
  'selectedAssemblies',
  'status',
  'workTitle',
];

describe('assertQuoteEditable', () => {
  it.each([...frozenLockedQuoteFields, ...editableLockedQuoteFields])('allows %s before a quote has a job', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasJob: false,
        kind: 'product',
        status: 'accepted',
      }),
    ).toEqual({ allowed: true });
  });

  it.each(frozenLockedQuoteFields)('rejects %s after a quote has a job', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasJob: true,
        kind: 'product',
        status: 'accepted',
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
        kind: 'product',
        status: 'accepted',
      }),
    ).toEqual({ allowed: true });
  });

  it('rejects unknown changed fields after a quote has a job', () => {
    expect(
      assertQuoteEditable({
        changedFields: ['futureCommercialField'],
        hasJob: true,
        kind: 'product',
        status: 'accepted',
      }),
    ).toEqual({
      allowed: false,
      reason: 'Quote is locked because it already has a Job; futureCommercialField cannot be changed.',
    });
  });

  it.each(frozenLockedQuoteFields)('allows custom quote %s changes before acceptance even with a job', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasJob: true,
        kind: 'custom',
        status: 'sent',
      }),
    ).toEqual({ allowed: true });
  });

  it.each(frozenLockedQuoteFields)('rejects custom quote %s changes after acceptance', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasJob: false,
        kind: 'custom',
        status: 'accepted',
      }),
    ).toEqual({
      allowed: false,
      reason: `Quote is locked because it has been accepted; ${field} cannot be changed.`,
    });
  });

  it.each(editableLockedQuoteFields)('allows custom quote %s changes after acceptance', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasJob: false,
        kind: 'custom',
        status: 'accepted',
      }),
    ).toEqual({ allowed: true });
  });
});
