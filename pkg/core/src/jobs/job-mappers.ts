import type { jobs } from '@pkg/db';
import { Job } from '@pkg/schema';

export type JobRow = typeof jobs.$inferSelect;

export function mapJob(row: JobRow): Job {
  return Job.parse({
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    code: row.code,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    productId: row.productId,
    productSerialNumber: row.productSerialNumber,
    productSerialPrefix: row.productSerialPrefix,
    productSerialSequence: row.productSerialSequence,
    productSerialYear: row.productSerialYear,
    quoteId: row.quoteId,
    updatedAt: row.updatedAt.toISOString(),
    vinNumber: row.vinNumber,
    description: row.description,
  });
}
