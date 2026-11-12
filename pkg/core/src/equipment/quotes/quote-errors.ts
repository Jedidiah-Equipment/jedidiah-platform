export type QuoteErrorCode =
  | 'quote.allocation_conflict'
  | 'quote.already_cancelled'
  | 'quote.cancel_denied'
  | 'quote.cancel_not_an_update'
  | 'quote.custom_selected_assemblies'
  | 'quote.delivery_unconfirmed'
  | 'quote.discount_invalid'
  | 'quote.document_generation_not_allowed'
  | 'quote.forbidden'
  | 'quote.invalid_reference'
  | 'quote.invoiced'
  | 'quote.locked'
  | 'quote.not_found'
  // A persisted Quote row violating the product/custom offering shape the DB constraint guarantees
  // (e.g. a custom Quote missing its Work Title). A true invariant, not user-facing input.
  | 'quote.offering_invariant'
  | 'quote.product_bay_availability_not_applicable'
  | 'quote.status_not_pickable'
  | 'quote.wrong_stage';

export class QuoteError extends Error {
  constructor(
    readonly code: QuoteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'QuoteError';
  }
}

export const isQuoteError = (error: unknown): error is QuoteError => error instanceof QuoteError;
export const quoteNotFound = (id: string) => new QuoteError('quote.not_found', `Quote not found: ${id}`);
export const quoteAlreadyCancelled = () =>
  new QuoteError('quote.already_cancelled', 'Quote has already been cancelled.');

/**
 * Cancelling a Quote nobody has acted on is undoing paperwork, and whoever may edit the Quote may undo
 * it. Once it is Locked there is an accepted sale, a build under way or a machine allocated behind it,
 * and unwinding those is the administrator's call rather than the salesperson's.
 */
export const quoteCancelDenied = () =>
  new QuoteError(
    'quote.cancel_denied',
    'This quote has been accepted or has started a job, so only an administrator can cancel it.',
  );

/**
 * Cancelling decides what becomes of the Job and the machine underneath, so it is its own act with its
 * own surface. A status edit that slipped through would cancel the paper and leave both standing.
 */
export const quoteCancelNotAnUpdate = () =>
  new QuoteError(
    'quote.cancel_not_an_update',
    'Cancelling a quote also settles its job and machine, so it cannot be done by changing the status.',
  );

export const quoteStatusNotPickable = (status: string) =>
  new QuoteError('quote.status_not_pickable', `A quote cannot be moved to ${status} by changing its status.`);

/** Cancelling an Invoiced Quote would orphan an invoice the accounting system already holds. */
export const quoteInvoiced = () =>
  new QuoteError('quote.invoiced', 'This quote has been invoiced. Remove its Invoice Number before cancelling it.');

/** The Invoice Number is written only by the invoice Quote Actions; an edit may carry the stored one unchanged. */
export const quoteInvoiceNumberNotAnEdit = () =>
  new QuoteError('quote.wrong_stage', 'The Invoice Number is entered from the Quote Stage, not by editing the quote.');
