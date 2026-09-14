import { createGlobalSearchCondition, type Db, user, withPagination } from '@pkg/db';
import { getNextCursor } from '@pkg/schema';
import type { InventoryRecipientOptionListInput, InventoryRecipientOptionListResult } from '@pkg/schema/equipment';
import { InventoryRecipientOptionListResult as InventoryRecipientOptionListResultSchema } from '@pkg/schema/equipment';
import { and, asc, eq, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';

/**
 * Who may receive a Checkout Without a Job: any active Equipment person. Wider than the quick-switch
 * grid — a mechanic receives parts without ever working the tablet — but never a disabled account
 * or a device, for the reason `resolveMovementActor` refuses them as an Operator: the ledger keeps
 * the name forever, and a name that cannot answer for the stock should not be offered. One
 * predicate serves the picker and the post, so nothing the picker offers is refused on write.
 */
export function eligibleRecipientCondition(): SQL {
  return and(isNotNull(user.role), eq(user.isDevice, false), or(isNull(user.banned), eq(user.banned, false))) as SQL;
}

export async function listInventoryRecipients({
  db,
  input,
}: {
  db: Db;
  input: InventoryRecipientOptionListInput;
}): Promise<InventoryRecipientOptionListResult> {
  const where = and(eligibleRecipientCondition(), createGlobalSearchCondition(input.search, [sql`${user.name}`]));
  const page = db
    .select({ id: user.id, name: user.name, thumbnailDataUrl: user.image })
    .from(user)
    .where(where)
    .orderBy(asc(user.name), asc(user.id))
    .$dynamic();
  const [rows, total] = await Promise.all([withPagination(page, input), db.$count(user, where)]);

  return InventoryRecipientOptionListResultSchema.parse({
    items: rows,
    nextCursor: getNextCursor({ count: rows.length, cursor: input.cursor, total }),
    total,
  });
}
