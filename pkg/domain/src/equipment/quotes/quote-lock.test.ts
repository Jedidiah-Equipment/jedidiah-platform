import { describe, expect, it } from 'vitest';

import { assertQuoteEditable, isQuoteLocked, shouldOfferQuoteCancellation } from './quote-lock.js';

const alwaysEditableFields = [
  'invoiceNumber',
  'notes',
  'documentNotes',
  'plannedDeliveryDate',
  'preferredDeliveryDate',
  'validUntil',
  'workItems',
];
const acceptedTermsFields = ['depositPercent', 'deliveryTerms', 'deliveryPrice', 'discountPercent'];
const frozenFields = [
  'customerId',
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
        hasEverSourcedJob: false,
        hasProductUnit: false,
        kind,
        status: 'cancelled',
      }),
    ).toEqual({
      allowed: false,
      reason: 'Quote is locked because it has been cancelled; status cannot be changed.',
    });
  });

  it.each([...frozenFields, ...acceptedTermsFields, ...alwaysEditableFields])(
    'allows %s before a quote has a job',
    (field) => {
      expect(
        assertQuoteEditable({
          changedFields: [field],
          hasEverSourcedJob: false,
          hasProductUnit: false,
          kind: 'product',
          status: 'accepted',
        }),
      ).toEqual({ allowed: true });
    },
  );

  it.each(frozenFields)('rejects %s after a product quote has a job', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasEverSourcedJob: true,
        hasProductUnit: false,
        kind: 'product',
        status: 'accepted',
      }),
    ).toEqual({
      allowed: false,
      reason: `Quote is locked because it has already sourced a Job; ${field} cannot be changed.`,
    });
  });

  it('rejects unknown changed fields after a quote has a job', () => {
    expect(
      assertQuoteEditable({
        changedFields: ['futureCommercialField'],
        hasEverSourcedJob: true,
        hasProductUnit: false,
        kind: 'product',
        status: 'accepted',
      }),
    ).toEqual({
      allowed: false,
      reason: 'Quote is locked because it has already sourced a Job; futureCommercialField cannot be changed.',
    });
  });

  it.each([...frozenFields, ...acceptedTermsFields])(
    'allows custom quote %s changes before acceptance even with a job',
    (field) => {
      expect(
        assertQuoteEditable({
          changedFields: [field],
          hasEverSourcedJob: true,
          hasProductUnit: false,
          kind: 'custom',
          status: 'sent',
        }),
      ).toEqual({ allowed: true });
    },
  );

  it.each(frozenFields)('rejects custom quote %s changes after acceptance', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasEverSourcedJob: false,
        hasProductUnit: false,
        kind: 'custom',
        status: 'accepted',
      }),
    ).toEqual({
      allowed: false,
      reason: `Quote is locked because it has been accepted; ${field} cannot be changed.`,
    });
  });

  it.each(frozenFields)('rejects %s on an accepted stock sale', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasEverSourcedJob: false,
        hasProductUnit: true,
        kind: 'product',
        status: 'accepted',
      }),
    ).toEqual({
      allowed: false,
      reason: `Quote is locked because it has been accepted; ${field} cannot be changed.`,
    });
  });

  const acceptedLockedQuotes = [
    [
      'a build-to-order quote that has sourced a job',
      { hasEverSourcedJob: true, hasProductUnit: false, kind: 'product' },
    ],
    ['a stock sale', { hasEverSourcedJob: false, hasProductUnit: true, kind: 'product' }],
    [
      'a stock sale that went on to source a rework job',
      { hasEverSourcedJob: true, hasProductUnit: true, kind: 'product' },
    ],
    ['a custom quote', { hasEverSourcedJob: false, hasProductUnit: false, kind: 'custom' }],
  ] as const;

  it.each(acceptedLockedQuotes)('allows the accepted terms and every always-editable field on %s', (_label, quote) => {
    expect(
      assertQuoteEditable({
        ...quote,
        changedFields: [...acceptedTermsFields, ...alwaysEditableFields],
        status: 'accepted',
      }),
    ).toEqual({ allowed: true });
  });

  it.each(acceptedTermsFields)('rejects %s once a quote is cancelled', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasEverSourcedJob: true,
        hasProductUnit: false,
        kind: 'product',
        status: 'cancelled',
      }),
    ).toEqual({
      allowed: false,
      reason: `Quote is locked because it has been cancelled; ${field} cannot be changed.`,
    });
  });

  it.each(alwaysEditableFields)('allows %s changes after a custom quote is cancelled', (field) => {
    expect(
      assertQuoteEditable({
        changedFields: [field],
        hasEverSourcedJob: true,
        hasProductUnit: false,
        kind: 'custom',
        status: 'cancelled',
      }),
    ).toEqual({ allowed: true });
  });
});

describe('isQuoteLocked', () => {
  it('keeps a product quote locked after its only job is cancelled', () => {
    expect(
      isQuoteLocked({
        hasEverSourcedJob: true,
        hasProductUnit: false,
        kind: 'product',
        status: 'accepted',
      }),
    ).toBe(true);
  });

  it.each(['product', 'custom'] as const)('locks cancelled %s quotes', (kind) => {
    expect(isQuoteLocked({ hasEverSourcedJob: false, hasProductUnit: false, kind, status: 'cancelled' })).toBe(true);
  });

  it('locks product quotes only after a job exists', () => {
    expect(
      isQuoteLocked({ hasEverSourcedJob: false, hasProductUnit: false, kind: 'product', status: 'accepted' }),
    ).toBe(false);
    expect(isQuoteLocked({ hasEverSourcedJob: true, hasProductUnit: false, kind: 'product', status: 'sent' })).toBe(
      true,
    );
  });

  it('locks allocation quotes on acceptance before a job exists', () => {
    expect(isQuoteLocked({ hasEverSourcedJob: false, hasProductUnit: true, kind: 'product', status: 'sent' })).toBe(
      false,
    );
    expect(isQuoteLocked({ hasEverSourcedJob: false, hasProductUnit: true, kind: 'product', status: 'accepted' })).toBe(
      true,
    );
  });

  it('locks custom quotes only after acceptance', () => {
    expect(isQuoteLocked({ hasEverSourcedJob: true, hasProductUnit: false, kind: 'custom', status: 'sent' })).toBe(
      false,
    );
    expect(isQuoteLocked({ hasEverSourcedJob: false, hasProductUnit: false, kind: 'custom', status: 'accepted' })).toBe(
      true,
    );
  });
});

describe('shouldOfferQuoteCancellation', () => {
  const lockedQuote = { hasEverSourcedJob: true, kind: 'product', productUnitId: null, status: 'accepted' } as const;

  it('offers the action for a locked Quote and administrator access', () => {
    expect(shouldOfferQuoteCancellation({ canCancel: true, quote: lockedQuote })).toBe(true);
  });

  it('withholds it without the permission, once cancelled, and while the Quote is still unlocked', () => {
    expect(shouldOfferQuoteCancellation({ canCancel: false, quote: lockedQuote })).toBe(false);
    expect(shouldOfferQuoteCancellation({ canCancel: true, quote: { ...lockedQuote, status: 'cancelled' } })).toBe(
      false,
    );
    expect(
      shouldOfferQuoteCancellation({
        canCancel: true,
        quote: { ...lockedQuote, hasEverSourcedJob: false, status: 'sent' },
      }),
    ).toBe(false);
  });
});
