import { EQUIPMENT_ROLES, type EquipmentRole } from '@pkg/schema';
import { QuoteStatus } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';
import { getRolePermissions } from '../../auth/authorization.js';
import {
  assertQuoteEditable,
  editableLockedQuoteFields,
  isQuoteLocked,
  QUOTE_FORM_FIELDS,
  quoteFormFieldAccess,
  shouldOfferQuoteCancellation,
} from './quote-lock.js';

const actorFor = (role: EquipmentRole) => ({ permissions: getRolePermissions(role) });
const superAdmin = actorFor('super-admin');

const alwaysEditableFields = ['notes', 'documentNotes', 'plannedDeliveryDate', 'preferredDeliveryDate', 'validUntil'];
const settlingTermsFields = ['depositPercent', 'deliveryTerms', 'deliveryPrice', 'discountPercent', 'workItems'];
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
        actor: superAdmin,
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

  it.each([...frozenFields, ...settlingTermsFields, ...alwaysEditableFields])(
    'allows %s before a quote has a job',
    (field) => {
      expect(
        assertQuoteEditable({
          actor: superAdmin,
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
        actor: superAdmin,
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
        actor: superAdmin,
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

  it.each([...frozenFields, ...settlingTermsFields])(
    'allows custom quote %s changes before acceptance even with a job',
    (field) => {
      expect(
        assertQuoteEditable({
          actor: superAdmin,
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
        actor: superAdmin,
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
        actor: superAdmin,
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

  it.each(acceptedLockedQuotes)('allows the Settling Terms and every always-editable field on %s', (_label, quote) => {
    expect(
      assertQuoteEditable({
        actor: superAdmin,
        ...quote,
        changedFields: [...settlingTermsFields, ...alwaysEditableFields],
        status: 'accepted',
      }),
    ).toEqual({ allowed: true });
  });

  it.each(settlingTermsFields)('rejects %s once a quote is cancelled', (field) => {
    expect(
      assertQuoteEditable({
        actor: superAdmin,
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
        actor: superAdmin,
        changedFields: [field],
        hasEverSourcedJob: true,
        hasProductUnit: false,
        kind: 'custom',
        status: 'cancelled',
      }),
    ).toEqual({ allowed: true });
  });
});

describe('editableLockedQuoteFields', () => {
  const neverLocked = ['notes', 'plannedDeliveryDate', 'preferredDeliveryDate'];
  const documentFields = ['documentNotes', 'validUntil'];
  const fields = (role: EquipmentRole, status: Parameters<typeof editableLockedQuoteFields>[0]['status']) =>
    [...editableLockedQuoteFields({ actor: actorFor(role), status })].toSorted();

  it.each([
    ['accepted', 'sales', [...neverLocked, ...documentFields]],
    ['accepted', 'admin', [...neverLocked, ...documentFields, ...settlingTermsFields]],
    ['awaiting-approval', 'admin', neverLocked],
    ['awaiting-approval', 'super-admin', [...neverLocked, ...documentFields, ...settlingTermsFields]],
    ['awaiting-invoice', 'super-admin', neverLocked],
    ['invoiced', 'super-admin', neverLocked],
    ['cancelled', 'super-admin', [...neverLocked, ...documentFields]],
  ] as const)('opens %s to %s for only its row of the table', (status, role, expected) => {
    expect(fields(role, status)).toEqual([...expected].toSorted());
  });

  it('opens nothing to someone who cannot update Quotes', () => {
    expect(fields('job-viewer', 'accepted')).toEqual([]);
  });
});

describe('quoteFormFieldAccess', () => {
  const statusRoles = QuoteStatus.options.flatMap((status) => EQUIPMENT_ROLES.map((role) => [status, role] as const));
  const quoteIn = (status: QuoteStatus) => ({
    hasEverSourcedJob: true,
    kind: 'custom' as const,
    productUnitId: null,
    status,
  });

  it.each(statusRoles)('offers on a %s Quote to %s exactly the fields the server accepts', (status, role) => {
    const actor = actorFor(role);
    const access = quoteFormFieldAccess({ actor, quote: quoteIn(status) });
    const canUpdate = getRolePermissions(role).includes('equipment_quote:update');

    for (const field of QUOTE_FORM_FIELDS) {
      const server = assertQuoteEditable({
        actor,
        changedFields: [field],
        hasEverSourcedJob: true,
        hasProductUnit: false,
        kind: 'custom',
        status,
      });
      expect({ field, editable: access[field] }).toEqual({ field, editable: canUpdate && server.allowed });
    }
  });

  // Spec #1944 decision 10: Document notes and Valid until close to all but a Super Administrator once sent for approval.
  it.each([
    ['accepted', 'sales', true],
    ['accepted', 'admin', true],
    ['awaiting-approval', 'admin', false],
    ['awaiting-approval', 'super-admin', true],
    ['awaiting-invoice', 'admin', false],
    ['awaiting-invoice', 'super-admin', false],
    ['invoiced', 'admin', false],
    ['invoiced', 'super-admin', false],
  ] as const)('on a %s Quote %s may change Document notes and Valid until: %s', (status, role, editable) => {
    const access = quoteFormFieldAccess({ actor: actorFor(role), quote: quoteIn(status) });

    expect([access.documentNotes, access.validUntil]).toEqual([editable, editable]);
  });

  it.each(['accepted', 'awaiting-approval', 'awaiting-invoice', 'invoiced'] as const)(
    'keeps Notes and the delivery dates open on a %s Quote',
    (status) => {
      const access = quoteFormFieldAccess({ actor: actorFor('sales'), quote: quoteIn(status) });

      expect([access.notes, access.plannedDeliveryDate, access.preferredDeliveryDate]).toEqual([true, true, true]);
    },
  );
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

  it('withholds it without the permission, once cancelled or invoiced, and while the Quote is still unlocked', () => {
    expect(shouldOfferQuoteCancellation({ canCancel: false, quote: lockedQuote })).toBe(false);
    expect(shouldOfferQuoteCancellation({ canCancel: true, quote: { ...lockedQuote, status: 'invoiced' } })).toBe(
      false,
    );
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
