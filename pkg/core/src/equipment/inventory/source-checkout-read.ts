import { createGlobalSearchCondition, type Db, user, withPagination } from '@pkg/db';
import { parts, stockMovements } from '@pkg/db/equipment';
import { getNextCursor } from '@pkg/schema';
import type { SourceCheckoutListInput, SourceCheckoutListResult } from '@pkg/schema/equipment';
import { SourceCheckoutListResult as SourceCheckoutListResultSchema } from '@pkg/schema/equipment';
import { and, count, desc, eq, type SQL, sql } from 'drizzle-orm';

import { checkoutWithoutJobMatches } from './ledger.js';

/** Paginated Checkouts Without a Job, newest first, as the sources a linked Return to Store may name. */
export async function listSourceCheckouts({
  db,
  input,
}: {
  db: Db;
  input: SourceCheckoutListInput;
}): Promise<SourceCheckoutListResult> {
  const where = and(
    checkoutWithoutJobMatches(),
    input.partId === undefined ? undefined : eq(stockMovements.partId, input.partId),
    input.recipientUserId === undefined ? undefined : eq(stockMovements.recipientUserId, input.recipientUserId),
    createGlobalSearchCondition(input.search, [
      sql`${parts.code}`,
      sql`${parts.name}`,
      sql`${user.name}`,
      sql`${stockMovements.note}`,
    ]),
  ) as SQL;
  const page = db
    .select({
      createdAt: stockMovements.createdAt,
      id: stockMovements.id,
      lengthMm: stockMovements.lengthMm,
      // The shape constraint requires a purpose on every Checkout Without a Job.
      note: sql<string>`${stockMovements.note}`,
      partCode: parts.code,
      partId: stockMovements.partId,
      partName: parts.name,
      quantity: sql<number>`(-${stockMovements.delta})::double precision`,
      recipientName: user.name,
      recipientUserId: user.id,
      returnedQuantity: sql<number>`coalesce((
        select sum(linked_return.delta)
        from equipment.stock_movement linked_return
        where linked_return.source_checkout_id = ${stockMovements.id}
      ), 0)::double precision`,
      unitCost: stockMovements.unitCost,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(stockMovements)
    .innerJoin(parts, eq(parts.id, stockMovements.partId))
    .innerJoin(user, eq(user.id, stockMovements.recipientUserId))
    .where(where)
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .$dynamic();
  const countQuery = db
    .select({ value: count() })
    .from(stockMovements)
    .innerJoin(parts, eq(parts.id, stockMovements.partId))
    .innerJoin(user, eq(user.id, stockMovements.recipientUserId))
    .where(where);
  const [rows, [totalRow]] = await Promise.all([withPagination(page, input), countQuery]);
  const total = totalRow?.value ?? 0;

  return SourceCheckoutListResultSchema.parse({
    items: rows,
    nextCursor: getNextCursor({ count: rows.length, cursor: input.cursor, total }),
    total,
  });
}
