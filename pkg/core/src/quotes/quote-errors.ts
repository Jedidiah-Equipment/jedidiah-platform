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
