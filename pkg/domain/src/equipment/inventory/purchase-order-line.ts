/**
 * What a record that outlives a draft rewrite names a line by: a Part Line by its Part, a Custom Line
 * by its own id. A draft save deletes and re-inserts its lines, so a Part Line's id is new on every
 * save while its Part is not; a Custom Line's id is minted by the client and echoed back, so it is
 * the stable one. Audit collection keys and stored invoice-flag resolutions both predate line ids and
 * are keyed this way — use a line's `id` for anything that only has to hold on a sent order.
 */
export function purchaseOrderLineSubjectKey(line: { id: string; partId?: string | null }): string {
  return line.partId ?? line.id;
}

type PurchaseOrderLineOrderKey = { partCode: string | null; position: number };

/**
 * The one line order: Part Lines by Part code, then Custom Lines in the order they were keyed. The
 * order's own read and the invoice cross-check both sort by it, because invoice matching pairs
 * greedily and two orders of the same lines could pair them differently.
 */
export function comparePurchaseOrderLines(left: PurchaseOrderLineOrderKey, right: PurchaseOrderLineOrderKey): number {
  if (left.partCode !== null && right.partCode !== null) return left.partCode.localeCompare(right.partCode);
  if (left.partCode === null && right.partCode === null) return left.position - right.position;

  return left.partCode === null ? 1 : -1;
}
