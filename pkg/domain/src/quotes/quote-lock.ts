import type { QuoteKind, QuoteStatus } from '@pkg/schema';

export const EDITABLE_LOCKED_QUOTE_FIELDS: ReadonlySet<string> = new Set([
  'invoiceNumber',
  'notes',
  'documentNotes',
  'plannedDeliveryDate',
  'preferredDeliveryDate',
  'validUntil',
  'workItems',
]);

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

  for (const field of changedFields) {
    if (!EDITABLE_LOCKED_QUOTE_FIELDS.has(field)) {
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
