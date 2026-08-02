export function deriveCommitment({
  cfoQuantity,
  drawnQuantity,
  isClosedOut = false,
}: {
  cfoQuantity: number;
  drawnQuantity: number;
  isClosedOut?: boolean;
}): number {
  // Over-returns warn but post; keep the specified CFO − drawn derivation literal so every return
  // re-opens demand until the separate close-out predicate releases it.
  return isClosedOut ? 0 : Math.max(0, cfoQuantity - drawnQuantity);
}
