import type { AuthId, UUID } from '@pkg/schema';

export type CheckoutErrorCode =
  | 'inventory.invalid_source_checkout'
  | 'inventory.quote_not_found'
  | 'inventory.quote_not_open'
  | 'inventory.quote_not_parts_sale'
  | 'inventory.recipient_ineligible';

export class CheckoutError extends Error {
  constructor(
    readonly code: CheckoutErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CheckoutError';
  }
}

export const isCheckoutError = (error: unknown): error is CheckoutError => error instanceof CheckoutError;
export const checkoutRecipientIneligible = (recipientUserId: AuthId) =>
  new CheckoutError(
    'inventory.recipient_ineligible',
    `Recipient is unknown, disabled, a device, or not an Equipment user: ${recipientUserId}`,
  );
export const invalidSourceCheckout = (sourceCheckoutId: UUID) =>
  new CheckoutError(
    'inventory.invalid_source_checkout',
    `Movement is not a Checkout without a Job: ${sourceCheckoutId}`,
  );
export const checkoutQuoteNotFound = (quoteId: UUID) =>
  new CheckoutError('inventory.quote_not_found', `Quote not found: ${quoteId}`);

/** Every other Quote sources a Job, and its stock goes to the Job. */
export const checkoutQuoteNotPartsSale = (quoteId: UUID) =>
  new CheckoutError('inventory.quote_not_parts_sale', `Quote is not a Parts Sale: ${quoteId}`);
export const checkoutQuoteNotOpen = (quoteId: UUID) =>
  new CheckoutError('inventory.quote_not_open', `Parts Sale is rejected or cancelled: ${quoteId}`);
