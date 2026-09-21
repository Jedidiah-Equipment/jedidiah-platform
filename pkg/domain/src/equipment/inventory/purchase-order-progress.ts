import type { PurchaseOrderDerivedStatus, PurchaseOrderProgress, PurchaseOrderStatus } from '@pkg/schema/equipment';

/** One ordered line, reduced to the two facts progress is read from. */
export type PurchaseOrderProgressLine = {
  id: string;
  quantity: number;
};

type PurchaseOrderProgressInput = {
  lines: readonly PurchaseOrderProgressLine[];
  /** What each line has taken in and kept, by line id — receipts today, Arrivals too once they exist. */
  receivedByLineId: ReadonlyMap<string, number>;
};

/**
 * Receiving progress is computed, never toggled (spec §4). Over-receipt is still `received`: the
 * ledger records what arrived and the warning is raised at the post, so nothing past the ordered
 * quantity needs a state of its own.
 */
export function derivePurchaseOrderProgress({
  lines,
  receivedByLineId,
}: PurchaseOrderProgressInput): PurchaseOrderProgress {
  const receivedOf = (line: PurchaseOrderProgressLine) => receivedByLineId.get(line.id) ?? 0;

  if (lines.every((line) => receivedOf(line) <= 0)) return 'sent';

  return lines.every((line) => receivedOf(line) >= line.quantity) ? 'received' : 'partially-received';
}

/**
 * The one projection every surface reads. `status` stays the narrow stored fact
 * (`draft`/`approved`/`sent`/`cancelled`); receipts and the close-short assertion widen it here
 * rather than in the column.
 */
export function derivePurchaseOrderStatus({
  closedShortAt,
  lines,
  receivedByLineId,
  status,
}: PurchaseOrderProgressInput & {
  /** Only its presence matters here — the timestamp itself is the order's own record. */
  closedShortAt: Date | string | null;
  status: PurchaseOrderStatus;
}): PurchaseOrderDerivedStatus {
  if (status !== 'sent') return status;
  if (closedShortAt !== null) return 'closed-short';
  // A sent order with nothing received yet still wears the `approved` badge: the list's Sent tick
  // carries whether it has gone out, so the badge only ever names the highest level reached.
  const progress = derivePurchaseOrderProgress({ lines, receivedByLineId });

  return progress === 'sent' ? 'approved' : progress;
}
