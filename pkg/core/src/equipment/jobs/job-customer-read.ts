import type { customers } from '@pkg/db/equipment';
import {
  type ProductUnitOwnershipTransferRecency,
  resolveJobCustomer,
  resolveNewestOwnershipTransfer,
} from '@pkg/domain/equipment';

type CustomerColumns = Partial<Record<keyof typeof customers.$inferSelect, true>>;

/** One row of the ownership log `jobOwnershipTransfersWith` loads, carrying the Customer it names. */
export type JobOwnershipTransferRow<TCustomer> = ProductUnitOwnershipTransferRecency & {
  toCustomer: TCustomer | null;
};

/**
 * The Product Unit's ownership log a Job read loads so `resolveJobCustomerForRow` can name its current
 * Owner, with whichever Customer columns that read shows.
 */
export function jobOwnershipTransfersWith<const TColumns extends CustomerColumns>(customerColumns: TColumns) {
  return {
    columns: { createdAt: true, id: true, occurredOn: true, toCustomerId: true },
    with: { toCustomer: { columns: customerColumns } },
  } as const;
}

/**
 * The one place a read turns stored rows into "who does this Job belong to". A Unit-bound Job follows
 * its machine's current Owner — `null` means Stock — and a Custom Job follows its Quote.
 */
export function resolveJobCustomerForRow<TCustomer>(row: {
  productUnit: { ownershipTransfers: readonly JobOwnershipTransferRow<TCustomer>[] } | null;
  quote: { customer: TCustomer | null } | null;
}): TCustomer | null {
  return resolveJobCustomer({
    productUnit: row.productUnit
      ? { owner: resolveNewestOwnershipTransfer(row.productUnit.ownershipTransfers)?.toCustomer ?? null }
      : null,
    quoteCustomer: row.quote?.customer ?? null,
  });
}
