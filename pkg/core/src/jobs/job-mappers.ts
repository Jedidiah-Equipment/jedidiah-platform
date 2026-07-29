import type { jobs } from '@pkg/db';
import { Job } from '@pkg/schema';

export type JobRow = typeof jobs.$inferSelect;

/** The identity facts a Job reads off its machine. A Custom Job has no Unit, so it has none of them. */
export type JobProductUnitRow = {
  productSerialNumber: string;
  vinNumber: string | null;
  product: { id: string } | null;
};

/**
 * The machine's identity — serial, Product, VIN — belongs to the Product Unit, so a rework and the
 * build it follows report the same facts about the same machine. `productUnit` is required rather
 * than optional: a caller that omitted it would silently map a Unit-bound Job as a Custom Job.
 */
export function mapJob(row: JobRow, productUnit: JobProductUnitRow | null): Job {
  return Job.parse({
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    code: row.code,
    completedOn: row.completedOn,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    productUnit:
      row.productUnitId && productUnit
        ? {
            id: row.productUnitId,
            productId: productUnit.product?.id ?? null,
            productSerialNumber: productUnit.productSerialNumber,
            vinNumber: productUnit.vinNumber,
          }
        : null,
    quoteId: row.quoteId,
    updatedAt: row.updatedAt.toISOString(),
    description: row.description,
  });
}
