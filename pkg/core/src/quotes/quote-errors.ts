export class QuoteNotFoundError extends Error {
  readonly code = 'quote.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Quote not found: ${id}`);
    this.name = 'QuoteNotFoundError';
    this.metadata = { id };
  }
}

export class QuoteTransitionDeniedError extends Error {
  readonly code = 'quote.transition_denied';

  constructor(message: string) {
    super(message);
    this.name = 'QuoteTransitionDeniedError';
  }
}

export class QuoteFrozenError extends Error {
  readonly code = 'quote.frozen';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Quote is frozen and cannot be edited: ${id}`);
    this.name = 'QuoteFrozenError';
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

export type QuoteCoreError =
  | QuoteDiscountInvalidError
  | QuoteFrozenError
  | QuoteInvalidReferenceError
  | QuoteNotFoundError
  | QuoteTransitionDeniedError;

export function isQuoteCoreError(error: unknown): error is QuoteCoreError {
  return (
    error instanceof QuoteDiscountInvalidError ||
    error instanceof QuoteFrozenError ||
    error instanceof QuoteInvalidReferenceError ||
    error instanceof QuoteNotFoundError ||
    error instanceof QuoteTransitionDeniedError
  );
}
