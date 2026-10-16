import { type Db, user } from '@pkg/db';
import type { UserAccessSummary } from '@pkg/schema';
import type { NoteThreadKind } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { type NoteRecord, noteThreadStore } from './note-thread.js';

/**
 * Appends one entry to a Note Thread under its record's lock, gated by that record's `addNote` Action. Entries are
 * authored and append-only, so not audited.
 */
export async function addNote<K extends NoteThreadKind>({
  db,
  actor,
  thread,
  input: raw,
}: {
  db: Db;
  actor: UserAccessSummary;
  thread: K;
  input: unknown;
}): Promise<NoteRecord[K]> {
  const store = noteThreadStore[thread];
  const { id, text } = store.parseInput(raw);
  return db.transaction(async (tx) => {
    const record = await store.lock(tx, id, actor);
    const row = await store.insert(tx, { threadId: record.id, authorUserId: actor.userId, text });
    const [author] = await tx.select({ name: user.name }).from(user).where(eq(user.id, actor.userId));
    return store.toRecord(row, author?.name ?? '');
  });
}
