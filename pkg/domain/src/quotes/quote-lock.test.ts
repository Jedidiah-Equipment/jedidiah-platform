import { describe, expect, it } from 'vitest';

import { assertQuoteEditable, editableLockedQuoteFields, isQuoteLocked } from './quote-lock.js';

const alwaysEditableFields = [
  'invoiceNumber',
  'notes',
  'documentNotes',
  'plannedDeliveryDate',
  'preferredDeliveryDate',
  'validUntil',
  'workItems',
];
const lockedFields = [
  'customerId',
  'depositPercent',
  'deliveryIncluded',
  'deliveryPrice',
  'discountPercent',
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
        hasProductUnit: false,
        kind,
        status: 'cancelled',
      }),
    ).toEqual({
      allowed: false,
      reason: 'Quote is locked because it has been cancelled; status cannot be changed.',
    });
  });

  it.each([...lockedFields, ...alwaysEditableFields])('allows %s before a quote has a job', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasJob: false,
        hasProductUnit: false,
        kind: 'product',
        status: 'accepted',
      }),
    ).toEqual({ allowed: true });
  });

  it.each(lockedFields)('rejects %s after a product quote has a job', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasJob: true,
        hasProductUnit: false,
        kind: 'product',
        status: 'accepted',
      }),
    ).toEqual({
      allowed: false,
      reason: `Quote is locked because it already has a Job; ${field} cannot be changed.`,
    });
  });

  it.each(alwaysEditableFields)('allows %s after a quote has a job', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasJob: true,
        hasProductUnit: false,
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
        hasProductUnit: false,
        kind: 'product',
        status: 'accepted',
      }),
    ).toEqual({
      allowed: false,
      reason: 'Quote is locked because it already has a Job; futureCommercialField cannot be changed.',
    });
  });

  it.each(lockedFields)('allows custom quote %s changes before acceptance even with a job', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasJob: true,
        hasProductUnit: false,
        kind: 'custom',
        status: 'sent',
      }),
    ).toEqual({ allowed: true });
  });

  it.each(lockedFields)('rejects custom quote %s changes after acceptance', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasJob: false,
        hasProductUnit: false,
        kind: 'custom',
        status: 'accepted',
      }),
    ).toEqual({
      allowed: false,
      reason: `Quote is locked because it has been accepted; ${field} cannot be changed.`,
    });
  });

  it.each(alwaysEditableFields)('allows custom quote %s changes after acceptance', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasJob: false,
        hasProductUnit: false,
        kind: 'custom',
        status: 'accepted',
      }),
    ).toEqual({ allowed: true });
  });

  it.each(alwaysEditableFields)('allows %s changes after a custom quote is cancelled', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasJob: true,
        hasProductUnit: false,
        kind: 'custom',
        status: 'cancelled',
      }),
    ).toEqual({ allowed: true });
  });

  it('rejects a discount change on an accepted stock sale without the capability', () => {
    expect(
      assertQuoteEditable({
        changedFields: ['discountPercent'],
        hasJob: false,
        hasProductUnit: true,
        kind: 'product',
        status: 'accepted',
      }),
    ).toEqual({
      allowed: false,
      reason: 'Quote is locked because it has been accepted; discountPercent cannot be changed.',
    });
  });

  it('allows a discount change on an accepted stock sale with the capability', () => {
    expect(
      assertQuoteEditable({
        canDiscountAllocationQuote: true,
        changedFields: ['discountPercent'],
        hasJob: false,
        hasProductUnit: true,
        kind: 'product',
        status: 'accepted',
      }),
    ).toEqual({ allowed: true });
  });

  it('allows a discount change on a stock sale that went on to source a rework job', () => {
    expect(
      assertQuoteEditable({
        canDiscountAllocationQuote: true,
        changedFields: ['discountPercent'],
        hasJob: true,
        hasProductUnit: true,
        kind: 'product',
        status: 'accepted',
      }),
    ).toEqual({ allowed: true });
  });

  it.each(
    lockedFields.filter((field) => field !== 'discountPercent'),
  )('still rejects %s on an accepted stock sale with the capability', (field) => {
    expect(
      assertQuoteEditable({
        canDiscountAllocationQuote: true,
        changedFields: [field],
        hasJob: false,
        hasProductUnit: true,
        kind: 'product',
        status: 'accepted',
      }),
    ).toEqual({
      allowed: false,
      reason: `Quote is locked because it has been accepted; ${field} cannot be changed.`,
    });
  });

  it('rejects a discount change on a cancelled stock sale even with the capability', () => {
    expect(
      assertQuoteEditable({
        canDiscountAllocationQuote: true,
        changedFields: ['discountPercent'],
        hasJob: false,
        hasProductUnit: true,
        kind: 'product',
        status: 'cancelled',
      }),
    ).toEqual({
      allowed: false,
      reason: 'Quote is locked because it has been cancelled; discountPercent cannot be changed.',
    });
  });

  it('rejects a discount change on a job-locked build-to-order quote even with the capability', () => {
    expect(
      assertQuoteEditable({
        canDiscountAllocationQuote: true,
        changedFields: ['discountPercent'],
        hasJob: true,
        hasProductUnit: false,
        kind: 'product',
        status: 'accepted',
      }),
    ).toEqual({
      allowed: false,
      reason: 'Quote is locked because it already has a Job; discountPercent cannot be changed.',
    });
  });

  it('rejects a discount change on an accepted custom quote even with the capability', () => {
    expect(
      assertQuoteEditable({
        canDiscountAllocationQuote: true,
        changedFields: ['discountPercent'],
        hasJob: false,
        hasProductUnit: false,
        kind: 'custom',
        status: 'accepted',
      }),
    ).toEqual({
      allowed: false,
      reason: 'Quote is locked because it has been accepted; discountPercent cannot be changed.',
    });
  });
});

describe('editableLockedQuoteFields', () => {
  it('returns the always-editable set when the capability is absent', () => {
    expect([...editableLockedQuoteFields({ hasProductUnit: true, kind: 'product', status: 'accepted' })]).toEqual(
      alwaysEditableFields,
    );
  });

  it('adds the discount on an accepted stock sale when the capability is present', () => {
    expect([
      ...editableLockedQuoteFields({
        canDiscountAllocationQuote: true,
        hasProductUnit: true,
        kind: 'product',
        status: 'accepted',
      }),
    ]).toEqual([...alwaysEditableFields, 'discountPercent']);
  });

  it.each([
    ['a cancelled stock sale', { hasProductUnit: true, kind: 'product', status: 'cancelled' }],
    ['a build-to-order quote', { hasProductUnit: false, kind: 'product', status: 'accepted' }],
    ['a custom quote', { hasProductUnit: false, kind: 'custom', status: 'accepted' }],
  ] as const)('withholds the discount on %s', (_label, quote) => {
    expect([...editableLockedQuoteFields({ canDiscountAllocationQuote: true, ...quote })]).toEqual(
      alwaysEditableFields,
    );
  });
});

describe('isQuoteLocked', () => {
  it.each(['product', 'custom'] as const)('locks cancelled %s quotes', (kind) => {
    expect(isQuoteLocked({ hasJob: false, hasProductUnit: false, kind, status: 'cancelled' })).toBe(true);
  });

  it('locks product quotes only after a job exists', () => {
    expect(isQuoteLocked({ hasJob: false, hasProductUnit: false, kind: 'product', status: 'accepted' })).toBe(false);
    expect(isQuoteLocked({ hasJob: true, hasProductUnit: false, kind: 'product', status: 'sent' })).toBe(true);
  });

  it('locks allocation quotes on acceptance before a job exists', () => {
    expect(isQuoteLocked({ hasJob: false, hasProductUnit: true, kind: 'product', status: 'sent' })).toBe(false);
    expect(isQuoteLocked({ hasJob: false, hasProductUnit: true, kind: 'product', status: 'accepted' })).toBe(true);
  });

  it('locks custom quotes only after acceptance', () => {
    expect(isQuoteLocked({ hasJob: true, hasProductUnit: false, kind: 'custom', status: 'sent' })).toBe(false);
    expect(isQuoteLocked({ hasJob: false, hasProductUnit: false, kind: 'custom', status: 'accepted' })).toBe(true);
  });
});
