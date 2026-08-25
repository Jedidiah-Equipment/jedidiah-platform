import {
  createGlobalSearchCondition,
  currentOwnerCustomerId,
  customers,
  type Db,
  jobs,
  products,
  productUnits,
  quotes,
  withPagination,
} from '@pkg/db';
import { parseJobCodeSearch } from '@pkg/domain';
import type { InventoryJobOptionListInput, InventoryJobOptionListResult, JobPickerTab } from '@pkg/schema';
import {
  formatJobCode,
  getNextCursor,
  InventoryJobOptionListResult as InventoryJobOptionListResultSchema,
} from '@pkg/schema';
import { and, asc, count, desc, eq, isNull, or, type SQL, sql } from 'drizzle-orm';

import { jobIsNotClosedOut } from './close-out-service.js';

/**
 * Which Customer a Job counts as, in SQL — a Unit-bound Job resolves to whoever holds the machine
 * now and to `NULL` when we hold it; only a Custom Job falls back to its Quote. The same rule the
 * Job List filters by, so a Job found here by Customer is the one that Customer sees elsewhere.
 */
const jobCustomerId = sql<string | null>`case
  when ${jobs.productUnitId} is null then ${quotes.customerId}
  else ${currentOwnerCustomerId(jobs.productUnitId)}
end`;

/**
 * Jobs eligible for the stores movement picker, whose rules deliberately differ by direction.
 * Checkout excludes work whose stock life has ended — cancelled or closed out — while Return stays
 * broad, because recovered stock must not be stranded by lifecycle state. Which of those eligible
 * Jobs the reader is shown, and in what order, is the picker tab's question rather than this one's.
 */
export async function listInventoryJobOptions({
  db,
  input,
}: {
  db: Db;
  input: InventoryJobOptionListInput;
}): Promise<InventoryJobOptionListResult> {
  const where = buildJobOptionWhere(input);
  const page = db
    .select({
      code: jobs.code,
      completedOn: jobs.completedOn,
      createdAt: jobs.createdAt,
      customerCompanyName: customers.companyName,
      id: jobs.id,
      productName: products.name,
      quoteKind: quotes.kind,
      updatedAt: jobs.updatedAt,
      workTitle: quotes.workTitle,
    })
    .from(jobs)
    .leftJoin(productUnits, eq(productUnits.id, jobs.productUnitId))
    .leftJoin(products, eq(products.id, productUnits.productId))
    .leftJoin(quotes, eq(quotes.id, jobs.quoteId))
    .leftJoin(customers, eq(customers.id, jobCustomerId))
    .where(where)
    .orderBy(...jobOptionOrderBy(input.tab))
    .$dynamic();
  const countQuery = db
    .select({ value: count() })
    .from(jobs)
    .leftJoin(productUnits, eq(productUnits.id, jobs.productUnitId))
    .leftJoin(products, eq(products.id, productUnits.productId))
    .leftJoin(quotes, eq(quotes.id, jobs.quoteId))
    .leftJoin(customers, eq(customers.id, jobCustomerId))
    .where(where);
  const [rows, [totalRow]] = await Promise.all([withPagination(page, input), countQuery]);
  const total = totalRow?.value ?? 0;

  return InventoryJobOptionListResultSchema.parse({
    items: rows.map((row) => ({ ...row, code: formatJobCode(row.code) })),
    nextCursor: getNextCursor({ count: rows.length, cursor: input.cursor, total }),
    total,
  });
}

/** Newest first on the tab's own date, with the Job id breaking ties so paging cannot repeat a row. */
function jobOptionOrderBy(tab: JobPickerTab): SQL[] {
  return [desc(tab === 'created' ? jobs.createdAt : jobs.updatedAt), asc(jobs.id)];
}

function buildJobOptionWhere(input: InventoryJobOptionListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.movementType === 'checkout') {
    conditions.push(isNull(jobs.cancelledAt), jobIsNotClosedOut(jobs.id));
  }

  if (input.tab === 'incomplete') {
    conditions.push(isNull(jobs.completedOn));
  }

  if (input.search) {
    const code = parseJobCodeSearch(input.search);
    conditions.push(
      or(
        createGlobalSearchCondition(input.search, [
          sql`concat('JOB-', lpad(${jobs.code}::text, 5, '0'))`,
          sql`${products.name}`,
          sql`${quotes.workTitle}`,
          sql`${customers.companyName}`,
        ]),
        code === undefined ? undefined : eq(jobs.code, code),
      ) as SQL,
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}
