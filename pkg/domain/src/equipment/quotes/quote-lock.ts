import type { QuoteKind, QuoteStatus } from '@pkg/schema/equipment';

const EDITABLE_LOCKED_QUOTE_FIELDS: ReadonlySet<string> = new Set([
  'invoiceNumber',
  'notes',
  'documentNotes',
  'plannedDeliveryDate',
  'preferredDeliveryDate',
  'validUntil',
  'workItems',
]);

const EDITABLE_ACCEPTED_LOCKED_QUOTE_FIELDS: ReadonlySet<string> = new Set([
  ...EDITABLE_LOCKED_QUOTE_FIELDS,
  'depositPercent',
  'deliveryTerms',
  'deliveryPrice',
  'discountPercent',
]);

/**
 * Which fields a Locked Quote still accepts. The price and specification freeze, but the terms the
 * sale is settled on — discount, deposit, and Delivery Terms — stay open while the Quote is accepted,
 * for anyone who can update Quotes at all (`equipment_quote:update`). A cancelled Quote moves none of them.
 */
export function editableLockedQuoteFields({ status }: { status: QuoteStatus }): ReadonlySet<string> {
  return status === 'accepted' ? EDITABLE_ACCEPTED_LOCKED_QUOTE_FIELDS : EDITABLE_LOCKED_QUOTE_FIELDS;
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
  hasEverSourcedJob,
  hasProductUnit,
  kind,
  status,
}: {
  changedFields: Iterable<string>;
  hasEverSourcedJob: boolean;
  hasProductUnit: boolean;
  kind: QuoteKind;
  status: QuoteStatus;
}): QuoteEditableResult {
  if (!isQuoteLocked({ hasEverSourcedJob, hasProductUnit, kind, status })) {
    return { allowed: true };
  }

  const lockReason =
    status === 'cancelled'
      ? 'it has been cancelled'
      : kind === 'product' && !hasProductUnit
        ? 'it has already sourced a Job'
        : 'it has been accepted';
  const editableFields = editableLockedQuoteFields({ status });

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

/**
 * Whether a surface should offer a Quote its own destructive cancel action. A Locked Quote's Status
 * field is closed, so without this there is no way to reach cancellation at all; an unlocked one is
 * cancelled from Status, which is the salesperson's path and needs no destructive button beside it.
 * Both surfaces ask this so a Quote cancellable in the browser is cancellable on a device too.
 */
export function shouldOfferQuoteCancellation({
  canCancel,
  quote,
}: {
  canCancel: boolean;
  quote: { hasEverSourcedJob: boolean; kind: QuoteKind; productUnitId: string | null; status: QuoteStatus };
}): boolean {
  return (
    canCancel &&
    quote.status !== 'cancelled' &&
    isQuoteLocked({
      hasEverSourcedJob: quote.hasEverSourcedJob,
      hasProductUnit: quote.productUnitId !== null,
      kind: quote.kind,
      status: quote.status,
    })
  );
}

export function isQuoteLocked({
  hasEverSourcedJob,
  hasProductUnit,
  kind,
  status,
}: {
  hasEverSourcedJob: boolean;
  hasProductUnit: boolean;
  kind: QuoteKind;
  status: QuoteStatus;
}) {
  // Cancellation is terminal regardless of the quote kind or whether a Job exists.
  if (status === 'cancelled') return true;

  return kind === 'product' ? hasEverSourcedJob || (hasProductUnit && status === 'accepted') : status === 'accepted';
}
