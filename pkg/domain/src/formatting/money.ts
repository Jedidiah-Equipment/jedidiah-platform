/** Rounds rands to cents, tolerating float noise such as `10.075 * 100 = 1007.4999…`. */
export function roundToCents(amount: number): number {
  const cents = amount * 100;
  const roundingTolerance = Number.EPSILON * Math.abs(cents);

  return Math.round(cents + roundingTolerance) / 100;
}
