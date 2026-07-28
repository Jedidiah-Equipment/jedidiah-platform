/**
 * The minimum an Ownership Transfer must carry to resolve a Product Unit's current Owner. Callers
 * pass richer rows (the Unit detail carries the actor and sourcing Quote) and only these fields are
 * read, so one rule serves every surface.
 */
export type ProductUnitOwnershipTransferRecency = {
  /** Plant business date the transfer happened — the primary ordering fact. */
  occurredOn: string;
  /**
   * Recorded-at instant, breaking ties between transfers asserted on the same date. Accepts the
   * `Date` a database row carries and the ISO string an API response carries, so server and browser
   * callers share this rule without either side re-mapping first.
   */
  createdAt: Date | string;
  /** Destination Customer, or `null` when the Unit returned to Stock. */
  toCustomerId: string | null;
};

/**
 * A Product Unit's current Owner: the newest Ownership Transfer's destination, or `null` when we
 * hold it. Ownership is never stored — the log is the truth, and a reversal is another row.
 */
export function resolveProductUnitOwnerId(transfers: readonly ProductUnitOwnershipTransferRecency[]): string | null {
  let newest: ProductUnitOwnershipTransferRecency | undefined;

  for (const transfer of transfers) {
    if (!newest || compareTransferRecency(transfer, newest) > 0) {
      newest = transfer;
    }
  }

  return newest?.toCustomerId ?? null;
}

/** A Unit is Stock when nobody owns it: never sold, or returned to us. */
export function isProductUnitInStock(transfers: readonly ProductUnitOwnershipTransferRecency[]): boolean {
  return resolveProductUnitOwnerId(transfers) === null;
}

function compareTransferRecency(
  left: ProductUnitOwnershipTransferRecency,
  right: ProductUnitOwnershipTransferRecency,
): number {
  if (left.occurredOn !== right.occurredOn) {
    return left.occurredOn < right.occurredOn ? -1 : 1;
  }

  const leftCreatedAt = toEpochMs(left.createdAt);
  const rightCreatedAt = toEpochMs(right.createdAt);

  if (leftCreatedAt === rightCreatedAt) return 0;

  return leftCreatedAt < rightCreatedAt ? -1 : 1;
}

function toEpochMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
