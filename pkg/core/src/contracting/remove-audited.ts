import { type Db, getForeignKeyViolationConstraint } from '@pkg/db';
import type { AuthId } from '@pkg/schema';
import { and, eq, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { type AuditDescriptor, recordAuditDelete } from '../audit/audit-writer.js';

// History tables must use restrictive foreign keys. The database is the final, concurrency-safe
// guard, including for referencing tables added by later waves; never maintain a parallel holder list.
/** Locks one row, deletes it and records the delete; a foreign key still holding the row becomes `inUse`. */
export async function removeAudited<TTable extends PgTable & { id: PgColumn }>({
  db,
  actorUserId,
  id,
  table,
  descriptor,
  lockWhere,
  notFound,
  inUse,
  assert,
}: {
  db: Db;
  actorUserId: AuthId;
  id: string;
  table: TTable;
  descriptor: AuditDescriptor<TTable['$inferSelect']>;
  /** Extra lock-select condition, AND-ed with the id match (a Farm's Customer). */
  lockWhere?: SQL;
  notFound: () => Error;
  /** The refusal for the restrictive foreign key that still holds the row, given its constraint name. */
  inUse: (constraint: string) => Error;
  assert?: (row: TTable['$inferSelect']) => void;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = (await tx
      .select()
      .from(table as PgTable)
      .where(lockWhere ? and(eq(table.id, id), lockWhere) : eq(table.id, id))
      .for('update')) as TTable['$inferSelect'][];
    if (!row) throw notFound();
    assert?.(row);
    try {
      await tx.delete(table).where(eq(table.id, id));
    } catch (error) {
      const constraint = getForeignKeyViolationConstraint(error);
      if (constraint) throw inUse(constraint);
      throw error;
    }
    await recordAuditDelete({ db: tx, descriptor, actorUserId, input: row });
  });
}
