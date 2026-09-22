import { createGlobalSearchCondition, type Db, withPagination } from '@pkg/db';
import { customers, quotes } from '@pkg/db/equipment';
import { PARTS_SALE_CHECKOUT_STATUSES } from '@pkg/domain/equipment';
import { getNextCursor } from '@pkg/schema';
import type { InventoryQuoteOptionListInput, InventoryQuoteOptionListResult } from '@pkg/schema/equipment';
import {
  formatQuoteCode,
  InventoryQuoteOptionListResult as InventoryQuoteOptionListResultSchema,
  parseQuoteCodeNumber,
} from '@pkg/schema/equipment';
import { and, asc, count, desc, eq, inArray, or, type SQL, sql } from 'drizzle-orm';

/**
 * The Quote facts a stores surface may see: never a price, since `stores` holds no Quote permission.
 * Read with `customers` joined on the Quote's Customer.
 */
export const inventoryQuoteSelection = {
  code: quotes.code,
  customerCompanyName: customers.companyName,
  id: quotes.id,
  status: quotes.status,
  workTitle: quotes.workTitle,
};

/** Parts Sales eligible for the stores movement picker, projected as `inventoryQuoteSelection`. */
export async function listInventoryQuoteOptions({
  db,
  input,
}: {
  db: Db;
  input: InventoryQuoteOptionListInput;
}): Promise<InventoryQuoteOptionListResult> {
  const where = buildQuoteOptionWhere(input);
  const page = db
    .select(inventoryQuoteSelection)
    .from(quotes)
    .innerJoin(customers, eq(customers.id, quotes.customerId))
    .where(where)
    .orderBy(desc(quotes.updatedAt), asc(quotes.id))
    .$dynamic();
  const countQuery = db
    .select({ value: count() })
    .from(quotes)
    .innerJoin(customers, eq(customers.id, quotes.customerId))
    .where(where);
  const [rows, [totalRow]] = await Promise.all([withPagination(page, input), countQuery]);
  const total = totalRow?.value ?? 0;

  return InventoryQuoteOptionListResultSchema.parse({
    items: rows.map((row) => ({ ...row, code: formatQuoteCode(row.code) })),
    nextCursor: getNextCursor({ count: rows.length, cursor: input.cursor, total }),
    total,
  });
}

function buildQuoteOptionWhere(input: InventoryQuoteOptionListInput): SQL {
  const conditions: SQL[] = [eq(quotes.isPartsSale, true)];

  // Checkout offers only a live sale; a return stays broad, so recovered stock is never stranded.
  if (input.movementType === 'checkout') {
    conditions.push(inArray(quotes.status, [...PARTS_SALE_CHECKOUT_STATUSES]));
  }

  if (input.search) {
    const code = parseQuoteCodeNumber(input.search);
    conditions.push(
      or(
        createGlobalSearchCondition(input.search, [
          sql`concat('QUO-', lpad(${quotes.code}::text, 5, '0'))`,
          sql`${quotes.workTitle}`,
          sql`${customers.companyName}`,
        ]),
        code === undefined ? undefined : eq(quotes.code, code),
      ) as SQL,
    );
  }

  return and(...conditions) as SQL;
}
