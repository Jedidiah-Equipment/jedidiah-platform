export function deriveCommitment({
  cfoQuantity,
  drawnQuantity,
  isClosedOut = false,
}: {
  cfoQuantity: number;
  drawnQuantity: number;
  isClosedOut?: boolean;
}): number {
  return isClosedOut ? 0 : Math.max(0, cfoQuantity - drawnQuantity);
}
