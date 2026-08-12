export class QuoteNotFoundError extends Error {
  readonly code = 'quote.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Quote not found: ${id}`);
    this.name = 'QuoteNotFoundError';
    this.metadata = { id };
  }
}

export class QuoteDiscountInvalidError extends Error {
  readonly code = 'quote.discount_invalid';

  constructor(message: string) {
    super(message);
    this.name = 'QuoteDiscountInvalidError';
  }
}

export class QuoteInvalidReferenceError extends Error {
  readonly code = 'quote.invalid_reference';

  constructor(message: string) {
    super(message);
    this.name = 'QuoteInvalidReferenceError';
  }
}

// Raised when a persisted Quote row violates the product/custom offering shape the DB constraint
// guarantees (e.g. a custom Quote missing its Work Title). A true invariant, not user-facing input.
export class QuoteOfferingInvariantError extends Error {
  readonly code = 'quote.offering_invariant';

  constructor(message: string) {
    super(message);
    this.name = 'QuoteOfferingInvariantError';
  }
}

export class QuoteCustomSelectedAssembliesError extends Error {
  readonly code = 'quote.custom_selected_assemblies';

  constructor(message: string) {
    super(message);
    this.name = 'QuoteCustomSelectedAssembliesError';
  }
}

export class QuoteLockedError extends Error {
  readonly code = 'quote.locked';

  constructor(message: string) {
    super(message);
    this.name = 'QuoteLockedError';
  }
}

export class QuoteAlreadyCancelledError extends Error {
  readonly code = 'quote.already_cancelled';

  constructor() {
    super('Quote has already been cancelled.');
    this.name = 'QuoteAlreadyCancelledError';
  }
}

/**
 * Cancelling a Quote nobody has acted on is undoing paperwork, and whoever may edit the Quote may undo
 * it. Once it is Locked there is an accepted sale, a build under way or a machine allocated behind it,
 * and unwinding those is the administrator's call rather than the salesperson's.
 */
export class QuoteCancelDeniedError extends Error {
  readonly code = 'quote.cancel_denied';

  constructor() {
    super('This quote has been accepted or has started a job, so only an administrator can cancel it.');
    this.name = 'QuoteCancelDeniedError';
  }
}

/**
 * Cancelling decides what becomes of the Job and the machine underneath, so it is its own act with its
 * own surface. A status edit that slipped through would cancel the paper and leave both standing.
 */
export class QuoteCancelNotAnUpdateError extends Error {
  readonly code = 'quote.cancel_not_an_update';

  constructor() {
    super('Cancelling a quote also settles its job and machine, so it cannot be done by changing the status.');
    this.name = 'QuoteCancelNotAnUpdateError';
  }
}

export class QuoteAllocationConflictError extends Error {
  readonly code = 'quote.allocation_conflict';

  constructor(message: string) {
    super(message);
    this.name = 'QuoteAllocationConflictError';
  }
}

export class QuoteDocumentGenerationNotAllowedError extends Error {
  readonly code = 'quote.document_generation_not_allowed';

  constructor(message: string) {
    super(message);
    this.name = 'QuoteDocumentGenerationNotAllowedError';
  }
}

export class QuoteProductBayAvailabilityNotApplicableError extends Error {
  readonly code = 'quote.product_bay_availability_not_applicable';

  constructor(message: string) {
    super(message);
    this.name = 'QuoteProductBayAvailabilityNotApplicableError';
  }
}

export type QuoteCoreError =
  | QuoteAlreadyCancelledError
  | QuoteAllocationConflictError
  | QuoteCancelDeniedError
  | QuoteCancelNotAnUpdateError
  | QuoteCustomSelectedAssembliesError
  | QuoteDocumentGenerationNotAllowedError
  | QuoteProductBayAvailabilityNotApplicableError
  | QuoteDiscountInvalidError
  | QuoteInvalidReferenceError
  | QuoteOfferingInvariantError
  | QuoteLockedError
  | QuoteNotFoundError;

export function isQuoteCoreError(error: unknown): error is QuoteCoreError {
  return (
    error instanceof QuoteAlreadyCancelledError ||
    error instanceof QuoteAllocationConflictError ||
    error instanceof QuoteCancelDeniedError ||
    error instanceof QuoteCancelNotAnUpdateError ||
    error instanceof QuoteDocumentGenerationNotAllowedError ||
    error instanceof QuoteProductBayAvailabilityNotApplicableError ||
    error instanceof QuoteCustomSelectedAssembliesError ||
    error instanceof QuoteDiscountInvalidError ||
    error instanceof QuoteInvalidReferenceError ||
    error instanceof QuoteOfferingInvariantError ||
    error instanceof QuoteLockedError ||
    error instanceof QuoteNotFoundError
  );
}
