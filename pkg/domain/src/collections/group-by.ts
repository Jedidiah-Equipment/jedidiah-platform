/**
 * Gathers rows under a key, in first-seen order.
 *
 * The non-empty tuple is the point: a group only exists because something fell into it, so a caller
 * can read the head without a null check the type system would otherwise demand.
 */
export function groupBy<TRow, TKey>(rows: readonly TRow[], keyOf: (row: TRow) => TKey): Map<TKey, [TRow, ...TRow[]]> {
  const groups = new Map<TKey, [TRow, ...TRow[]]>();

  for (const row of rows) {
    const group = groups.get(keyOf(row));
    if (group) group.push(row);
    else groups.set(keyOf(row), [row]);
  }

  return groups;
}
