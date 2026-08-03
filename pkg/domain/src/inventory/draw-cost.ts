/** One `checkout` (negative delta) or `return-to-store` (positive delta) row, with the cost it carried. */
export type JobDrawMovement = {
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
  let hasUnknownCost = false;
  let quantity = 0;
  let value = 0;

  for (const movement of orderedMovements) {
    // Checkout deltas are negative and return deltas positive, so the pool always moves by -delta.
    quantity -= movement.delta;
    if (movement.unitCost === null) hasUnknownCost = true;
    else value -= movement.delta * movement.unitCost;

    if (quantity <= 0) {
      hasUnknownCost = false;
      quantity = 0;
      value = 0;
    }
  }

  if (quantity === 0 || hasUnknownCost) return null;

  // Over-returns warn but still post. Spreading only the outstanding value over the larger returned
  // quantity keeps the excess from inventing inventory value or driving the Job's cost negative.
  return value / Math.max(quantity, returnQuantity);
}
