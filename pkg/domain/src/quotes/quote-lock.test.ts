import { describe, expect, it } from 'vitest';

import { assertQuoteEditable, isQuoteLocked } from './quote-lock.js';

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
  it.each(['product', 'custom'] as const)('rejects status changes on cancelled %s quotes', (kind) => {
    expect(
      assertQuoteEditable({
        changedFields: ['status'],
        hasJob: false,
        kind,
        status: 'cancelled',
      }),
    ).toEqual({
      allowed: false,
      reason: 'Quote is locked because it has been cancelled; status cannot be changed.',
    });
  });

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

describe('isQuoteLocked', () => {
  it.each(['product', 'custom'] as const)('locks cancelled %s quotes', (kind) => {
    expect(isQuoteLocked({ hasJob: false, kind, status: 'cancelled' })).toBe(true);
  });

  it('locks product quotes only after a job exists', () => {
    expect(isQuoteLocked({ hasJob: false, kind: 'product', status: 'accepted' })).toBe(false);
    expect(isQuoteLocked({ hasJob: true, kind: 'product', status: 'sent' })).toBe(true);
  });

  it('locks custom quotes only after acceptance', () => {
    expect(isQuoteLocked({ hasJob: true, kind: 'custom', status: 'sent' })).toBe(false);
    expect(isQuoteLocked({ hasJob: false, kind: 'custom', status: 'accepted' })).toBe(true);
  });
});
