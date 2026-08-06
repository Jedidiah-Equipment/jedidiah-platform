/**
 * The two shapes every inventory read folds its rows with. Both services replay ledger rows that
 * arrive flat and ordered, and both need the same two moves — gather by Part, then add something up
 * — so they share these rather than each keeping a copy that could drift in its ordering guarantee.
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
