import type { DatabaseTransaction } from '@pkg/db';
import { eq, type SQL, sql } from 'drizzle-orm';
import type { PgColumn, PgTable, PgUpdateSetSource } from 'drizzle-orm/pg-core';

type OrderedTable = PgTable & { id: PgColumn; displayOrder: PgColumn; updatedAt: PgColumn };

/** The display order after the table's last row, or after the last row `within` a scope such as one Job. */
export const nextDisplayOrder = (table: PgTable, within?: SQL) =>
  within
    ? sql<number>`coalesce((select max(display_order) + 1 from ${table} where ${within}), 0)`
    : sql<number>`coalesce((select max(display_order) + 1 from ${table}), 0)`;

/** Rewrites every row's display order to its position in `orderedIds`, which must name each row exactly once. */
export async function reorderDisplayOrder<TTable extends OrderedTable>(
  tx: DatabaseTransaction,
  table: TTable,
  orderedIds: readonly string[],
  mismatch: () => Error,
): Promise<void> {
  const rows = (await tx.select({ id: table.id }).from(table as PgTable)) as { id: string }[];
  const ids = new Set(rows.map((row) => row.id));
  const distinct = new Set(orderedIds);
  if (distinct.size !== orderedIds.length || distinct.size !== ids.size || orderedIds.some((id) => !ids.has(id)))
    throw mismatch();
  // OrderedTable guarantees both columns; TypeScript cannot map a generic table's columns onto its insert type.
  await Promise.all(
    orderedIds.map((id, index) =>
      tx
        .update(table)
        .set({ displayOrder: index, updatedAt: new Date() } as PgUpdateSetSource<TTable>)
        .where(eq(table.id, id)),
    ),
  );
}
