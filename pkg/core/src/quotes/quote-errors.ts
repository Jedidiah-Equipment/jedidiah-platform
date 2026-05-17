export class QuoteNotFoundError extends Error {
  constructor(id: string) {
    super(`Quote not found: ${id}`);
    this.name = 'QuoteNotFoundError';
  }
}

export class QuoteTransitionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteTransitionDeniedError';
  }
}

export class QuoteFrozenError extends Error {
  constructor(id: string) {
    super(`Quote is frozen and cannot be edited: ${id}`);
    this.name = 'QuoteFrozenError';
  }
}

export class QuoteDiscountInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteDiscountInvalidError';
  }
}
