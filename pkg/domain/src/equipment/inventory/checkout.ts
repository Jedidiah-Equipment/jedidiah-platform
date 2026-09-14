/**
 * A Checkout Without a Job: stock drawn to a Recipient rather than a Job. The ledger's shape
 * constraint pins everything else about such a row (no source link, a purpose in the note), so
 * these three facts are the whole test — and the narrowing they give is what a linked return
 * inherits its identity from.
 */
export function isCheckoutWithoutJob<
  T extends { jobId: string | null; movementType: string; recipientUserId: string | null },
>(movement: T): movement is T & { jobId: null; movementType: 'checkout'; recipientUserId: string } {
  return movement.movementType === 'checkout' && movement.jobId === null && movement.recipientUserId !== null;
}
