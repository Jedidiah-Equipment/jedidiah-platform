import { jobs, products, quotes } from '@pkg/db';
import { getJobDisplayName } from '@pkg/domain';
import { formatJobCode } from '@pkg/schema';

/**
 * The four columns a Job's display name is read from, and the mapper that reads them. Shared so a
 * Job reads the same on every surface that reaches it through `productUnits` and `quotes` joins.
 */
export const jobDisplaySelection = {
  code: jobs.code,
  productName: products.name,
  quoteKind: quotes.kind,
  workTitle: quotes.workTitle,
} as const;

export type JobDisplayRow = {
  code: number;
  productName: string | null;
  quoteKind: 'custom' | 'product' | null;
  workTitle: string | null;
};

export function jobDisplayNameOf(row: JobDisplayRow): string {
  return getJobDisplayName({
    code: formatJobCode(row.code),
    productName: row.productName,
    quoteKind: row.quoteKind,
    workTitle: row.workTitle,
  });
}
