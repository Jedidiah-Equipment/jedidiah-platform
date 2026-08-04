import type { StockMovementWarningCode } from '@pkg/schema';

/** The stock facts a Job movement is judged against, all scoped to one Job, Part and length bucket. */
export type StockMovementContext = {
  /** Stock on hand for this Part and length bucket, before the movement. */
  bucketQuantityOnHand: number;
  /**
   * CFO demand for this Job and Part, summed across its assemblies. Zero means the Job never
   * planned this Part at all — a custom Job has no CFO, and a Unit-bound one can still be drawn
   * off it — because a CFO line's quantity is constrained positive.
   */
  cfoQuantity: number;
  /** Net drawn for this Job, Part and length bucket — the quantity a return can reverse. */
  drawnBucketQuantity: number;
  /** Net drawn for this Job and Part across every length bucket. */
  drawnQuantity: number;
};

/**
 * Warnings never block (spec §3): a draw may exceed the CFO, take stock negative, or return more
 * than a Job drew, and all three still post. This is the single source of that judgement — the
 * checkout dialog raises it as a confirm prompt and the ledger service returns it on the post, so
 * the two can never disagree about what is worth flagging.
 */
export function deriveStockMovementWarnings({
  context,
  movementType,
  quantity,
}: {
  context: StockMovementContext;
  movementType: 'checkout' | 'return-to-store';
  quantity: number;
}): StockMovementWarningCode[] {
  if (movementType === 'return-to-store') {
    return quantity > context.drawnBucketQuantity ? ['exceeds-drawn'] : [];
  }

  const warnings: StockMovementWarningCode[] = [];
  // Only a Job that planned this Part can be drawn past its plan. Off-CFO draws are valid, and
  // saying "exceeds the CFO" where there is no CFO trains Stores to dismiss the warning that counts.
  if (context.cfoQuantity > 0 && context.drawnQuantity + quantity > context.cfoQuantity) {
    warnings.push('exceeds-cfo');
  }
  if (context.bucketQuantityOnHand - quantity < 0) warnings.push('negative-stock-on-hand');

  return warnings;
}

/**
 * Over-receipt warns and posts (spec §4) — the supplier sent what it sent, and the ledger has to
 * say so. Judged once here so the receiving screen's confirm prompt and the post agree; refused-at-
 * dock deliveries never reach this because nothing is posted for them at all.
 */
export function deriveReceiptWarnings({
  orderedQuantity,
  quantity,
  receivedQuantity,
}: {
  /** The line's ordered quantity. */
  orderedQuantity: number;
  /** The quantity being received now. */
  quantity: number;
  /** Cumulative receipts already posted against the line. */
  receivedQuantity: number;
}): StockMovementWarningCode[] {
  return receivedQuantity + quantity > orderedQuantity ? ['exceeds-ordered'] : [];
}
