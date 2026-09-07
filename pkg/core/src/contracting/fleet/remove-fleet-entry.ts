import { type Db, getForeignKeyViolationConstraint } from '@pkg/db';
import type { AuthId } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { type AuditDescriptor, recordAuditDelete } from '../../audit/audit-writer.js';
import { FleetError } from './fleet-errors.js';

// History tables must use restrictive foreign keys. The database is the final, concurrency-safe
// guard, including for referencing tables added by later waves; never maintain a parallel holder list.
export async function removeFleetEntry<TTable extends PgTable & { id: PgColumn }>({
  db,
  actorUserId,
  id,
  table,
  descriptor,
  assert,
}: {
  db: Db;
  actorUserId: AuthId;
  id: string;
  table: TTable;
  descriptor: AuditDescriptor<TTable['$inferSelect']>;
  assert?: (row: TTable['$inferSelect']) => void;
}) {
  await db.transaction(async (tx) => {
    const [row] = (await tx
      .select()
      .from(table as PgTable)
      .where(eq(table.id, id))
      .for('update')) as TTable['$inferSelect'][];
    if (!row) throw new FleetError('fleet.not_found', 'Fleet entry not found.');
    assert?.(row);
    try {
      await tx.delete(table).where(eq(table.id, id));
    } catch (error) {
      if (getForeignKeyViolationConstraint(error))
        throw new FleetError(
          'fleet.in_use',
          'This entry has linked records. Retire fleet entries with history instead of deleting them.',
        );
      throw error;
    }
    await recordAuditDelete({ db: tx, descriptor, actorUserId, input: row });
  });
}
