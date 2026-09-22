import type { QuoteStatus } from '@pkg/schema/equipment';

/**
 * A Checkout Without a Job: stock drawn to a Recipient rather than a Job or a Parts Sale. The ledger's
 * shape constraint pins everything else about such a row (no source link, a purpose in the note), so
 * these facts are the whole test — and the narrowing they give is what a linked return inherits its
 * identity from. A Parts Sale Checkout also carries no Job, which is why the Quote is checked too.
 */
export function isCheckoutWithoutJob<
  T extends { jobId: string | null; movementType: string; quoteId: string | null; recipientUserId: string | null },
>(movement: T): movement is T & { jobId: null; movementType: 'checkout'; quoteId: null; recipientUserId: string } {
  return (
    movement.movementType === 'checkout' &&
    movement.jobId === null &&
    movement.quoteId === null &&
    movement.recipientUserId !== null
  );
}

/** The Parts Sale statuses a Checkout may draw to. Returns ignore status: recovered stock must reach the ledger. */
export const PARTS_SALE_CHECKOUT_STATUSES: ReadonlySet<QuoteStatus> = new Set(['draft', 'sent', 'accepted']);
