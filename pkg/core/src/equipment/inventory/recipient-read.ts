import { createGlobalSearchCondition, type Db, user, withPagination } from '@pkg/db';
import { getNextCursor } from '@pkg/schema';
import type { InventoryRecipientOptionListInput, InventoryRecipientOptionListResult } from '@pkg/schema/equipment';
import { InventoryRecipientOptionListResult as InventoryRecipientOptionListResultSchema } from '@pkg/schema/equipment';
import { and, asc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';

/** Active Equipment people available to receive a Checkout, independent of movement permissions. */
export async function listInventoryRecipients({
  db,
  input,
}: {
  db: Db;
  input: InventoryRecipientOptionListInput;
}): Promise<InventoryRecipientOptionListResult> {
  const eligible = and(
    isNotNull(user.role),
    eq(user.isDevice, false),
    or(isNull(user.banned), eq(user.banned, false)),
    createGlobalSearchCondition(input.search, [sql`${user.name}`]),
  );
  const page = db
    .select({ id: user.id, name: user.name, thumbnailDataUrl: user.image })
    .from(user)
    .where(eligible)
    .orderBy(asc(user.name), asc(user.id))
    .$dynamic();
  const [rows, total] = await Promise.all([withPagination(page, input), db.$count(user, eligible)]);

  return InventoryRecipientOptionListResultSchema.parse({
    items: rows,
    nextCursor: getNextCursor({ count: rows.length, cursor: input.cursor, total }),
    total,
  });
}
