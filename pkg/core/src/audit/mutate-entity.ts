import type { DatabaseTransaction, Db } from '@pkg/db';
import type { AuthId } from '@pkg/schema';
import { and, eq, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable, PgUpdateSetSource } from 'drizzle-orm/pg-core';

import { type AuditDescriptor, diffAuditUpdate, recordAuditUpdate } from './audit-service.js';

/**
 * The audited-write shape, in one place: transaction -> row lock -> assert -> merge -> diff ->
 * skip-if-unchanged -> update -> audit event in the same transaction -> project. A caller declares what
 * is entity-specific and cannot skip what is not: the skip branch and the audit write belong to this
 * module, so a write and its audit event cannot disagree and a no-op cannot leave a phantom event.
 *
 * Deliberately NOT used by (each interrupts the sequence with real logic, and the raw
 * {@link diffAuditUpdate} + {@link recordAuditUpdate} pair exists for exactly these):
 * - Quote update/patch/cancel — the collections diff and the Locked Quote gate read the changed-field
 *   set between the diff and the write, and acceptance transfers an allocation in the same gap.
 * - Product update — the audit event is recorded after the post-update assembly/bay syncs so it
 *   captures the child collections.
 * - Part bulk import — one transaction over many rows, no per-row lock, skip is `continue`.
 * - The Job completion sweep — the order is inverted: it writes first (`WHERE completedOn IS NULL` is
 *   the additive latch), diffs after, with a null system actor.
 */
export async function mutateEntity<TTable extends PgTable & { id: PgColumn }, TResult>({
  actorUserId,
  assert,
  db,
  descriptor,
  id,
  lockWhere,
  notFound,
  project,
  set,
  table,
}: {
  actorUserId: AuthId;
  /**
   * Runs under the row lock, before the write. Domain gates (the cancelled-Job rule) and cross-entity
   * pre-checks (a Part's supplier) live here; throw to abort with the transaction still open.
   */
  assert?: (tx: DatabaseTransaction, before: TTable['$inferSelect']) => Promise<void> | void;
  db: Db;
  descriptor: AuditDescriptor<TTable['$inferSelect']>;
  id: string;
  /** Extra lock-select condition, AND-ed with the id match (a supplier's `isNull(deletedAt)`). */
  lockWhere?: SQL;
  /** Raised both when the lock select misses and when the update returns no row. */
  notFound: () => Error;
  /** Builds the caller's result inside the same transaction (re-query, secondary reads, schema parse). */
  project: (tx: DatabaseTransaction, row: TTable['$inferSelect']) => Promise<TResult> | TResult;
  /**
   * The write set. A full replacement for `updateXxxx`; an undefined-keeps merge over `before` for
   * `patchXxxx`. Include `updatedAt: new Date()` here where the table has one — never automatic,
   * because `parts` has no timestamp columns at all.
   */
  set: (before: TTable['$inferSelect']) => Partial<TTable['$inferInsert']>;
  table: TTable;
}): Promise<TResult> {
  return db.transaction(async (tx) => {
    const [before] = (await tx
      .select()
      .from(table as PgTable)
      .where(lockWhere ? and(eq(table.id, id), lockWhere) : eq(table.id, id))
      .for('update')) as TTable['$inferSelect'][];

    if (!before) {
      throw notFound();
    }

    await assert?.(tx, before);

    const patch = set(before);
    const after = { ...before, ...patch } as TTable['$inferSelect'];
    const changes = diffAuditUpdate(descriptor, before, after);

    if (!changes) {
      return project(tx, before);
    }

    const [row] = (await tx
      .update(table)
      .set(patch as PgUpdateSetSource<TTable>)
      .where(eq(table.id, id))
      .returning()) as TTable['$inferSelect'][];

    if (!row) {
      throw notFound();
    }

    await recordAuditUpdate({ db: tx, descriptor, actorUserId, after: row, changes });

    return project(tx, row);
  });
}
