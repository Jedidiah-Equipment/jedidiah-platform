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

export class QuoteDraftEmailRecipientMissingError extends Error {
  readonly code = 'quote.draft_email_recipient_missing';

  constructor(message: string) {
    super(message);
    this.name = 'QuoteDraftEmailRecipientMissingError';
  }
}

export type QuoteCoreError =
  | QuoteDocumentGenerationNotAllowedError
  | QuoteDraftEmailRecipientMissingError
  | QuoteDiscountInvalidError
  | QuoteInvalidReferenceError
  | QuoteLockedError
  | QuoteNotFoundError;

export function isQuoteCoreError(error: unknown): error is QuoteCoreError {
  return (
    error instanceof QuoteDocumentGenerationNotAllowedError ||
    error instanceof QuoteDraftEmailRecipientMissingError ||
    error instanceof QuoteDiscountInvalidError ||
    error instanceof QuoteInvalidReferenceError ||
    error instanceof QuoteLockedError ||
    error instanceof QuoteNotFoundError
  );
}
