import type { StockMovementWarningCode } from '@pkg/schema';

/** The stock facts a Job movement is judged against, all scoped to one Job, Part and length bucket. */
export type StockMovementContext = {
  /** Stock on hand for this Part and length bucket, before the movement. */
  bucketQuantityOnHand: number;
  /** CFO demand for this Job and Part, summed across its assemblies. */
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
  if (context.drawnQuantity + quantity > context.cfoQuantity) warnings.push('exceeds-cfo');
  if (context.bucketQuantityOnHand - quantity < 0) warnings.push('negative-stock-on-hand');

  return warnings;
}
