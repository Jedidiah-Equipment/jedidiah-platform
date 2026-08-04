import type { BuyListReason, DateOnlyIso } from '@pkg/schema';

/** The stock facts a buy-list row is judged on, all in the Part's own counting unit. */
export type BuyListDemand = {
  /** Stock on hand minus open commitment. Negative is demand the shelf cannot cover. */
  free: number;
  /**
   * Whether the Part's ledger holds any movement at all. A Part that has never been stocked has not
   * *run out* — spec §9's signal is stock **hitting** zero, and a catalogue entry nobody has ever
   * bought would otherwise pin the out-of-stock list and its notification open forever.
   */
  hasStockHistory: boolean;
  /** The Part's reorder level, or null where it has none. Zero reads the same as none. */
  minimumStock: number | null;
  /** Σ(ordered − received) over open lines of sent, un-closed orders. */
  onOrder: number;
  /** Stock on hand across every length bucket. */
  quantity: number;
};

export type BuyListSignal = {
  /** Empty means the Part is not on the list at all. */
  reasons: BuyListReason[];
  /** What it would take to clear every reason, before netting what is already coming. */
  shortfall: number;
  /** Shortfall net of on-order, floored at zero — the quantity a seeded PO line prefills with. */
  suggestedQuantity: number;
};

/**
 * Why a Part is on procurement's radar and how much of it to buy (spec §3, §12).
 *
 * The two shortfalls are a **max, never a sum**: both describe the same shelf, so a Part three short
 * for Jobs and six under its minimum needs six pieces, not nine. On-order is netted out here rather
 * than folded into free, so the row can still show what it is short beside what is already coming —
 * "PO-0042, expected Thursday" is the whole point of showing both.
 */
export function deriveBuyListSignal({
  free,
  hasStockHistory,
  minimumStock,
  onOrder,
  quantity,
}: BuyListDemand): BuyListSignal {
  const reasons: BuyListReason[] = [];
  // A reorder level of zero is a Part with nothing to fall below; only a real level makes a gap.
  const minimumShortfall = minimumStock === null ? 0 : minimumStock - quantity;

  if (quantity <= 0 && hasStockHistory) reasons.push('out-of-stock');
  if (free < 0) reasons.push('negative-free');
  if (minimumShortfall > 0) reasons.push('below-minimum');

  const shortfall = Math.max(-free, minimumShortfall, 0);

  return { reasons, shortfall, suggestedQuantity: Math.max(0, shortfall - onOrder) };
}

/** The two facts the buy list ranks on: when the earliest driving Job needs it, then Part code. */
export type BuyListRanking = {
  earliestDemandDate: DateOnlyIso | null;
  partCode: string;
};

/**
 * Earliest driving Slot date first (spec §3). A Part no scheduled Job is waiting on sorts **last**:
 * having no date is the absence of urgency, and an empty-string-sorts-first ordering would put the
 * least pressing rows at the top of the screen procurement reads top-down.
 */
export function compareBuyListRows(left: BuyListRanking, right: BuyListRanking): number {
  return (
    compareNullableDateOnly(left.earliestDemandDate, right.earliestDemandDate) ||
    left.partCode.localeCompare(right.partCode)
  );
}

/**
 * Soonest first, with "no date at all" ranked last rather than first — the ordering every
 * procurement surface shares, whether it is ranking Parts by demand or open order lines by promise.
 * Returns 0 for equal dates so a caller can chain its own tiebreak with `||`.
 */
export function compareNullableDateOnly(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  return left < right ? -1 : 1;
}
