import type { UserAccessSummary } from '@pkg/schema';
import { hasQuoteStatus, type QuoteKind, type QuoteStatus, soldQuoteStatuses } from '@pkg/schema/equipment';

import { hasPermission } from '../../auth/authorization.js';
import { quoteStatusLabels } from './quote-display.js';

const NEVER_LOCKED_FIELDS = ['notes', 'plannedDeliveryDate', 'preferredDeliveryDate'] as const;
const DOCUMENT_FIELDS = ['documentNotes', 'validUntil'] as const;
const COMPLETING_FIELDS = [
  'workItems',
  // The Settling Terms.
  'depositPercent',
  'deliveryTerms',
  'deliveryPrice',
  'discountPercent',
] as const;

type LockActor = Pick<UserAccessSummary, 'permissions'> | null | undefined;

/**
 * Which fields a Locked Quote still accepts from this actor. Notes and delivery dates never lock: a machine can be
 * invoiced before it is delivered. While a sold Quote is completed, an Administrator (`equipment_quote:price`)
 * changes its Settling Terms and Work Items; once sent for approval only a Super Administrator
 * (`equipment_quote:approve`) changes anything else, and once approved nobody does. The price and specification
 * of a Product Quote never reopen.
 */
export function editableLockedQuoteFields({
  actor,
  status,
}: {
  actor: LockActor;
  status: QuoteStatus;
}): ReadonlySet<string> {
  if (!hasPermission(actor, 'equipment_quote:update')) return new Set();

  const fields = new Set<string>(NEVER_LOCKED_FIELDS);
  const add = (more: readonly string[]) => {
    for (const field of more) fields.add(field);
  };

  switch (status) {
    case 'accepted':
      add(DOCUMENT_FIELDS);
      if (hasPermission(actor, 'equipment_quote:price')) add(COMPLETING_FIELDS);
      break;
    case 'awaiting-approval':
      if (hasPermission(actor, 'equipment_quote:approve')) add([...DOCUMENT_FIELDS, ...COMPLETING_FIELDS]);
      break;
    case 'awaiting-invoice':
    case 'invoiced':
      break;
    default:
      add(DOCUMENT_FIELDS);
  }

  return fields;
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
  actor,
  changedFields,
  hasEverSourcedJob,
  hasProductUnit,
  kind,
  status,
}: {
  actor: LockActor;
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
      : kind === 'product' && !hasProductUnit && !isPastAcceptance(status)
        ? 'it has already sourced a Job'
        : status === 'accepted'
          ? 'it has been accepted'
          : `it is ${quoteStatusLabels[status]}`;
  const editableFields = editableLockedQuoteFields({ actor, status });

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
    // An Invoiced Quote is cancelled only after its Invoice Number is removed.
    quote.status !== 'invoiced' &&
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
  if (status === 'cancelled' || isPastAcceptance(status)) return true;

  const sold = hasQuoteStatus(soldQuoteStatuses, status);

  return kind === 'product' ? hasEverSourcedJob || (hasProductUnit && sold) : sold;
}

/** Sent for approval or further: Locked whatever the kind. */
function isPastAcceptance(status: QuoteStatus): boolean {
  return status !== 'accepted' && hasQuoteStatus(soldQuoteStatuses, status);
}
