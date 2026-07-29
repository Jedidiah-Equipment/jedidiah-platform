import type { jobs } from '@pkg/db';
import { Job } from '@pkg/schema';

export type JobRow = typeof jobs.$inferSelect;

/** The identity facts a Job reads off its machine. A Custom Job has no Unit, so it has none of them. */
export type JobProductUnitRow = {
  productSerialNumber: string;
  productSerialPrefix: string;
  productSerialSequence: number;
  productSerialYear: number;
  vinNumber: string | null;
  product: { id: string } | null;
};

/**
 * The machine's identity — serial, Product, VIN — belongs to the Product Unit, so a rework and the
 * build it follows report the same facts about the same machine.
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
        vinNumber: null,
      };

  return Job.parse({
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    code: row.code,
    completedOn: row.completedOn,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    ...identity,
    quoteId: row.quoteId,
    updatedAt: row.updatedAt.toISOString(),
    description: row.description,
  });
}
