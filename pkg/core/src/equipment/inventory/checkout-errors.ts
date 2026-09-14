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

export type CheckoutCoreError = CheckoutRecipientIneligibleError | InvalidSourceCheckoutError;

export function isCheckoutCoreError(error: unknown): error is CheckoutCoreError {
  return error instanceof CheckoutRecipientIneligibleError || error instanceof InvalidSourceCheckoutError;
}
