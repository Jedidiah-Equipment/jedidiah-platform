import type { AuthId, UUID } from '@pkg/schema';

export class CheckoutRecipientIneligibleError extends Error {
  readonly code = 'inventory.recipient_ineligible';
  readonly metadata: { recipientUserId: AuthId };

  constructor(recipientUserId: AuthId) {
    super(`Recipient is unknown, disabled, a device, or not an Equipment user: ${recipientUserId}`);
    this.name = 'CheckoutRecipientIneligibleError';
    this.metadata = { recipientUserId };
  }
}

export class InvalidSourceCheckoutError extends Error {
  readonly code = 'inventory.invalid_source_checkout';
  readonly metadata: { sourceCheckoutId: UUID };

  constructor(sourceCheckoutId: UUID) {
    super(`Movement is not a Checkout without a Job: ${sourceCheckoutId}`);
    this.name = 'InvalidSourceCheckoutError';
    this.metadata = { sourceCheckoutId };
  }
}

export class CheckoutQuoteNotFoundError extends Error {
  readonly code = 'inventory.quote_not_found';
  readonly metadata: { quoteId: UUID };

  constructor(quoteId: UUID) {
    super(`Quote not found: ${quoteId}`);
    this.name = 'CheckoutQuoteNotFoundError';
    this.metadata = { quoteId };
  }
}

/** Every other Quote sources a Job, and its stock goes to the Job. */
export class CheckoutQuoteNotPartsSaleError extends Error {
  readonly code = 'inventory.quote_not_parts_sale';
  readonly metadata: { quoteId: UUID };

  constructor(quoteId: UUID) {
    super(`Quote is not a Parts Sale: ${quoteId}`);
    this.name = 'CheckoutQuoteNotPartsSaleError';
    this.metadata = { quoteId };
  }
}

export class CheckoutQuoteNotOpenError extends Error {
  readonly code = 'inventory.quote_not_open';
  readonly metadata: { quoteId: UUID };

  constructor(quoteId: UUID) {
    super(`Parts Sale is rejected or cancelled: ${quoteId}`);
    this.name = 'CheckoutQuoteNotOpenError';
    this.metadata = { quoteId };
  }
}

export type CheckoutCoreError =
  | CheckoutQuoteNotFoundError
  | CheckoutQuoteNotOpenError
  | CheckoutQuoteNotPartsSaleError
  | CheckoutRecipientIneligibleError
  | InvalidSourceCheckoutError;

export function isCheckoutCoreError(error: unknown): error is CheckoutCoreError {
  return (
    error instanceof CheckoutQuoteNotFoundError ||
    error instanceof CheckoutQuoteNotOpenError ||
    error instanceof CheckoutQuoteNotPartsSaleError ||
    error instanceof CheckoutRecipientIneligibleError ||
    error instanceof InvalidSourceCheckoutError
  );
}
