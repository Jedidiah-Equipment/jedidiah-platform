import type { AuthId } from '@pkg/schema';
import type { QuoteStatus } from '@pkg/schema/equipment';

import { quoteStatusLabels } from './quote-display.js';

type QuoteTransitionSubject = { status: QuoteStatus; acceptedAt: Date | null };

/**
 * One move along a sold Quote's way to its invoice: the statuses it leaves and the columns that travel with it,
 * including the ones the database requires cleared. It judges no one: the caller has already asserted the Quote
 * Action. A move with no edge from the Quote's status is a programming error, not a refusal.
 */
const edge =
  <Event extends { at: Date }, Columns extends { readonly status: QuoteStatus }>(
    verb: string,
    from: readonly QuoteStatus[],
    columns: (event: Event, quote: QuoteTransitionSubject) => Columns,
  ) =>
  (quote: QuoteTransitionSubject, event: Event): Columns & { updatedAt: Date } => {
    if (!from.includes(quote.status))
      throw new Error(`Cannot ${verb} a Quote that is ${quoteStatusLabels[quote.status]}.`);
    return { ...columns(event, quote), updatedAt: event.at };
  };

/** The columns that clear a sent-back note; any move off `accepted` must write them, as the database requires. */
export const clearedSentBack = { sentBackAt: null, sentBackByUserId: null, sentBackNote: null } as const;

export const quoteTransitions = {
  /** Sending a never-accepted Custom Quote whose Job is finished is its acceptance. */
  sendForApproval: edge(
    'send for approval',
    ['draft', 'sent', 'accepted'],
    (event: { at: Date }, quote) =>
      ({
        status: 'awaiting-approval',
        statusChangedAt: event.at,
        acceptedAt: quote.acceptedAt ?? event.at,
        ...clearedSentBack,
      }) as const,
  ),
  approve: edge(
    'approve',
    ['awaiting-approval'],
    (event: { at: Date }) => ({ status: 'awaiting-invoice', statusChangedAt: event.at }) as const,
  ),
  sendBack: edge(
    'send back',
    ['awaiting-approval', 'awaiting-invoice'],
    (event: { at: Date; byUserId: AuthId; note: string }) =>
      ({
        status: 'accepted',
        statusChangedAt: event.at,
        sentBackAt: event.at,
        sentBackByUserId: event.byUserId,
        sentBackNote: event.note,
      }) as const,
  ),
  stampInvoice: edge(
    'stamp an Invoice Number on',
    ['awaiting-invoice'],
    (event: { at: Date; byUserId: AuthId; invoiceNumber: string }) =>
      ({
        status: 'invoiced',
        statusChangedAt: event.at,
        invoiceNumber: event.invoiceNumber,
        invoicedAt: event.at,
        invoicedByUserId: event.byUserId,
      }) as const,
  ),
  /** The number was mistyped: the Quote stays Invoiced, dated from when it was first stamped. */
  correctInvoiceNumber: edge(
    'correct the Invoice Number of',
    ['invoiced'],
    (event: { at: Date; invoiceNumber: string }) =>
      ({ status: 'invoiced', invoiceNumber: event.invoiceNumber }) as const,
  ),
  removeInvoiceNumber: edge(
    'remove the Invoice Number from',
    ['invoiced'],
    (event: { at: Date }) =>
      ({
        status: 'awaiting-invoice',
        statusChangedAt: event.at,
        invoiceNumber: null,
        invoicedAt: null,
        invoicedByUserId: null,
      }) as const,
  ),
};
