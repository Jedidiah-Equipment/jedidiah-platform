export type QuoteErrorCode =
  | 'quote.allocation_conflict'
  | 'quote.already_cancelled'
  | 'quote.cancel_denied'
  | 'quote.cancel_not_an_update'
  | 'quote.custom_selected_assemblies'
  | 'quote.delivery_unconfirmed'
  | 'quote.discount_invalid'
  | 'quote.document_generation_not_allowed'
  | 'quote.invalid_reference'
  | 'quote.locked'
  | 'quote.not_found'
  // A persisted Quote row violating the product/custom offering shape the DB constraint guarantees
  // (e.g. a custom Quote missing its Work Title). A true invariant, not user-facing input.
  | 'quote.offering_invariant'
  | 'quote.product_bay_availability_not_applicable';

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
