/**
 * How every inventory read adds its rows up. Both services replay ledger rows that arrive flat and
 * ordered, and both need the same total — so they share these rather than each keeping a copy that
 * could drift in what it does with an unpriced member. Grouping those rows is `groupBy` in
 * `@pkg/domain`, which carries no inventory meaning at all.
 */

export function sumBy<TRow>(rows: readonly TRow[], toValue: (row: TRow) => number): number {
  return rows.reduce((total, row) => total + toValue(row), 0);
}

/** Σ, but a single unpriced member makes the whole total unpriced rather than quietly smaller. */
export function sumNullableBy<TRow>(rows: readonly TRow[], toValue: (row: TRow) => number | null): number | null {
  return rows.reduce<number | null>((total, row) => {
    const value = toValue(row);

    return total === null || value === null ? null : total + value;
  }, 0);
}
