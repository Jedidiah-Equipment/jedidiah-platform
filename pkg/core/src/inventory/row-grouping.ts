/**
 * The shapes every inventory read folds its rows with. Both services replay ledger rows that arrive
 * flat and ordered, and both need the same moves — gather by Part, then add something up — so they
 * share these rather than each keeping a copy that could drift in its ordering guarantee or in what
 * it does with an unpriced member.
 */

/** Groups in first-seen order; the non-empty tuple lets a caller read the head without a null check. */
export function groupBy<TRow, TKey>(rows: readonly TRow[], keyOf: (row: TRow) => TKey): Map<TKey, [TRow, ...TRow[]]> {
  const groups = new Map<TKey, [TRow, ...TRow[]]>();

  for (const row of rows) {
    const group = groups.get(keyOf(row));
    if (group) group.push(row);
    else groups.set(keyOf(row), [row]);
  }

  return groups;
}

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
