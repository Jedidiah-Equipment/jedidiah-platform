/** One `checkout` (negative delta) or `return-to-store` (positive delta) row, with the cost it carried. */
export type JobDrawMovement = {
  delta: number;
  unitCost: number | null;
};

/** One `receipt` (positive delta) or `return-to-supplier` (negative delta) row against a PO line. */
export type PurchaseOrderReceiptMovement = {
  delta: number;
  unitCost: number | null;
};

/**
 * Prices a `return-to-store` at the cost the parts left with, not today's average, so a Job's net
 * material cost stays honest (spec §2).
 *
 * Replays one Job+Part+bucket's draws in ledger order, keeping a pool of still-drawn quantity and
 * value. A return spends that pool; once it empties the pool resets, so a later draw is priced from
 * its own stamps rather than from a fully-returned earlier one. Any unpriced draw still in the pool
 * makes the whole reversal uncosted — a partial stamp would invent value.
 */
export function deriveOutstandingDrawUnitCost(
  orderedMovements: readonly JobDrawMovement[],
  returnQuantity: number,
): number | null {
  // Checkout deltas are negative and return deltas positive, so the pool always moves by -delta.
  return deriveOutstandingPoolUnitCost(orderedMovements, returnQuantity, -1);
}

/**
 * Prices a `return-to-supplier` at the original receipts' stamped cost for the line (spec §2) — the
 * same pool replay, signs the other way up: receipts fill the pool and returns spend it. A line
 * received twice at different prices reverses at their quantity-weighted average, and a line whose
 * receipts have all gone back already has nothing left to price.
 */
export function deriveOutstandingReceiptUnitCost(
  orderedMovements: readonly PurchaseOrderReceiptMovement[],
  returnQuantity: number,
): number | null {
  return deriveOutstandingPoolUnitCost(orderedMovements, returnQuantity, 1);
}

/**
 * The pool replay both reversals share. `sign` orients it: the movements that *fill* the pool leave
 * `sign * delta` positive, and the ones that spend it leave it negative.
 */
function deriveOutstandingPoolUnitCost(
  orderedMovements: readonly { delta: number; unitCost: number | null }[],
  reversedQuantity: number,
  sign: 1 | -1,
): number | null {
  let hasUnknownCost = false;
  let quantity = 0;
  let value = 0;

  for (const movement of orderedMovements) {
    quantity += sign * movement.delta;
    if (movement.unitCost === null) hasUnknownCost = true;
    else value += sign * movement.delta * movement.unitCost;

    if (quantity <= 0) {
      hasUnknownCost = false;
      quantity = 0;
      value = 0;
    }
  }

  if (quantity === 0 || hasUnknownCost) return null;

  // Over-reversals warn but still post. Spreading only the outstanding value over the larger
  // reversed quantity keeps the excess from inventing value or driving a cost negative.
  return value / Math.max(quantity, reversedQuantity);
}
