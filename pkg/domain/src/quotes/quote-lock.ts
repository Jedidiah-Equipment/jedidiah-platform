import type { QuoteKind, QuoteStatus } from '@pkg/schema';

const EDITABLE_LOCKED_QUOTE_FIELDS: ReadonlySet<string> = new Set([
  'invoiceNumber',
  'notes',
  'documentNotes',
  'plannedDeliveryDate',
  'preferredDeliveryDate',
  'validUntil',
  'workItems',
]);

const EDITABLE_LOCKED_ALLOCATION_QUOTE_FIELDS: ReadonlySet<string> = new Set([
  ...EDITABLE_LOCKED_QUOTE_FIELDS,
  'discountPercent',
]);

/**
 * Which fields a Locked Quote still accepts. An Allocation Quote locks the moment it is accepted
 * rather than when it sources a Job, so its price freezes before the sale is settled and there is
 * no later window to negotiate in; the discount alone stays open, on that Quote alone, for anyone
 * who can update Quotes at all (`quote:update`).
 */
export function editableLockedQuoteFields({
  hasProductUnit,
  kind,
  status,
}: {
  hasProductUnit: boolean;
  kind: QuoteKind;
  status: QuoteStatus;
}): ReadonlySet<string> {
  const isAcceptedAllocationQuote = kind === 'product' && hasProductUnit && status === 'accepted';

  return isAcceptedAllocationQuote ? EDITABLE_LOCKED_ALLOCATION_QUOTE_FIELDS : EDITABLE_LOCKED_QUOTE_FIELDS;
}

export type QuoteEditableResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      reason: string;
    };

export function assertQuoteEditable({
  changedFields,
  hasJob,
  hasProductUnit,
  kind,
  status,
}: {
  changedFields: Iterable<string>;
  hasJob: boolean;
  hasProductUnit: boolean;
  kind: QuoteKind;
  status: QuoteStatus;
}): QuoteEditableResult {
  if (!isQuoteLocked({ hasJob, hasProductUnit, kind, status })) {
    return { allowed: true };
  }

  const lockReason =
    status === 'cancelled'
      ? 'it has been cancelled'
      : kind === 'product' && !hasProductUnit
        ? 'it already has a Job'
        : 'it has been accepted';
  const editableFields = editableLockedQuoteFields({ hasProductUnit, kind, status });

  for (const field of changedFields) {
    if (!editableFields.has(field)) {
      return {
        allowed: false,
        reason: `Quote is locked because ${lockReason}; ${field} cannot be changed.`,
      };
    }
  }

  return { allowed: true };
}

export function isQuoteLocked({
  hasJob,
  hasProductUnit,
  kind,
  status,
}: {
  hasJob: boolean;
  hasProductUnit: boolean;
  kind: QuoteKind;
  status: QuoteStatus;
}) {
  // Cancellation is terminal regardless of the quote kind or whether a Job exists.
  if (status === 'cancelled') return true;

  return kind === 'product' ? hasJob || (hasProductUnit && status === 'accepted') : status === 'accepted';
}
