import {
  createEscapedContainsSearchCondition,
  type Db,
  jobs,
  products,
  productUnits,
  quotes,
  withPagination,
} from '@pkg/db';
import { parseJobCodeSearch } from '@pkg/domain';
import type { InventoryJobOptionListInput, InventoryJobOptionListResult } from '@pkg/schema';
import {
  formatJobCode,
  getNextCursor,
  InventoryJobOptionListResult as InventoryJobOptionListResultSchema,
} from '@pkg/schema';
import { and, asc, count, desc, eq, isNull, or, type SQL, sql } from 'drizzle-orm';

import { jobDisplayNameOf, jobDisplaySelection } from '../jobs/job-display.js';
import { jobIsNotClosedOut } from './close-out-service.js';

/**
 * Jobs eligible for the stores movement picker, whose rules deliberately differ by direction.
 * Checkout starts with open work and lets an explicit search reach completed work until inventory
 * close-out. Return stays broad because recovered stock must not be stranded by lifecycle state.
 */
export async function listInventoryJobOptions({
  db,
  input,
}: {
  db: Db;
  input: InventoryJobOptionListInput;
}): Promise<InventoryJobOptionListResult> {
  const where = buildJobOptionWhere(input);
  const openFirst = input.movementType === 'checkout' && input.search.length > 0;
  const page = db
    .select({
      ...jobDisplaySelection,
      completedOn: jobs.completedOn,
      createdAt: jobs.createdAt,
      id: jobs.id,
    })
    .from(jobs)
    .leftJoin(productUnits, eq(productUnits.id, jobs.productUnitId))
    .leftJoin(products, eq(products.id, productUnits.productId))
    .leftJoin(quotes, eq(quotes.id, jobs.quoteId))
    .where(where)
    .orderBy(...(openFirst ? [asc(sql`${jobs.completedOn} is not null`)] : []), desc(jobs.createdAt), asc(jobs.id))
    .$dynamic();
  const countQuery = db
    .select({ value: count() })
    .from(jobs)
    .leftJoin(productUnits, eq(productUnits.id, jobs.productUnitId))
    .leftJoin(products, eq(products.id, productUnits.productId))
    .leftJoin(quotes, eq(quotes.id, jobs.quoteId))
    .where(where);
  const [rows, [totalRow]] = await Promise.all([withPagination(page, input), countQuery]);
  const total = totalRow?.value ?? 0;

  return InventoryJobOptionListResultSchema.parse({
    items: rows.map((row) => ({
      code: formatJobCode(row.code),
      completedOn: row.completedOn,
      displayName: jobDisplayNameOf(row),
      id: row.id,
    })),
    nextCursor: getNextCursor({ count: rows.length, cursor: input.cursor, total }),
    total,
  });
}

function buildJobOptionWhere(input: InventoryJobOptionListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.movementType === 'checkout') {
    conditions.push(isNull(jobs.cancelledAt), jobIsNotClosedOut(jobs.id));

    // Completion is searchable for late postings, but it should not crowd current work by default.
    if (!input.search) conditions.push(isNull(jobs.completedOn));
  }

  if (input.search) {
    const code = parseJobCodeSearch(input.search);
    conditions.push(
      or(
        createEscapedContainsSearchCondition(sql`concat('JOB-', lpad(${jobs.code}::text, 5, '0'))`, input.search),
        createEscapedContainsSearchCondition(sql`${products.name}`, input.search),
        createEscapedContainsSearchCondition(sql`${quotes.workTitle}`, input.search),
        code === undefined ? undefined : eq(jobs.code, code),
      ) as SQL,
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}
