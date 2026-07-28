import type { jobs } from '@pkg/db';
import { Job } from '@pkg/schema';

export type JobRow = typeof jobs.$inferSelect;

/** The identity facts a Job now reads off its machine instead of its own columns. */
export type JobProductUnitRow = {
  productSerialNumber: string;
  productSerialPrefix: string;
  productSerialSequence: number;
  productSerialYear: number;
  vinNumber: string | null;
  product: { id: string } | null;
};

/**
 * A Job's own serial and VIN columns are the expand half of the Product Unit extraction and are still
 * written, but nothing reads them: a Unit-bound Job reports the machine's identity, so a rework and
 * its build agree, and #1013 can drop the columns without changing a single read.
 */
export function mapJob(row: JobRow, productUnit?: JobProductUnitRow | null): Job {
  const identity = productUnit
    ? {
        productId: productUnit.product?.id ?? null,
        productSerialNumber: productUnit.productSerialNumber,
        productSerialPrefix: productUnit.productSerialPrefix,
        productSerialSequence: productUnit.productSerialSequence,
        productSerialYear: productUnit.productSerialYear,
        vinNumber: productUnit.vinNumber,
      }
    : {
        productId: null,
        productSerialNumber: null,
        productSerialPrefix: null,
        productSerialSequence: null,
        productSerialYear: null,
        vinNumber: row.vinNumber,
      };

  return Job.parse({
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    code: row.code,
    completedOn: row.completedOn,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    ...identity,
    quoteId: row.quoteId,
    updatedAt: row.updatedAt.toISOString(),
    description: row.description,
  });
}
