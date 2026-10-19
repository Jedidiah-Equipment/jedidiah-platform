import { type DatabaseTransaction, type Db, user } from '@pkg/db';
import {
  contractingBreakdownNotes,
  contractingBreakdowns,
  contractingJobNotes,
  contractingJobs,
} from '@pkg/db/contracting';
import { formatJobNumber, type NoteThreadRecord } from '@pkg/domain/contracting';
import type { AuthId, UserAccessSummary } from '@pkg/schema';
import { BreakdownNote, JobNote, type NoteThreadKind } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { selectBreakdowns, toBreakdownSummary } from '../breakdowns/breakdown-load.js';
import { lockBreakdownFor } from '../breakdowns/breakdown-service.js';
import { lockJobFor } from '../jobs/job-lock.js';

type NoteRow = { id: string; threadId: string; authorUserId: AuthId; text: string; createdAt: Date };

export type NoteRecord = { job: JobNote; breakdown: BreakdownNote };

/** A kind's note table and the column that names the thread a row belongs to; the Activity feed reads it too. */
export type NoteThreadTable = {
  table: typeof contractingJobNotes | typeof contractingBreakdownNotes;
  threadColumn: PgColumn;
};

export type NoteThreadStore<K extends NoteThreadKind> = {
  notes: NoteThreadTable;
  /** Locks the record and judges its `addNote` Action for this actor; throws the record's own refusal. */
  lock: (tx: DatabaseTransaction, id: string, actor: UserAccessSummary) => Promise<{ id: string }>;
  insert: (
    tx: DatabaseTransaction,
    values: { threadId: string; authorUserId: AuthId; text: string },
  ) => Promise<NoteRow>;
  /** Everyone who has noted this thread, distinct. */
  authorsOf: (db: Db | DatabaseTransaction, threadId: string) => Promise<AuthId[]>;
  /** What a push needs: the note, its author's name, the record as the reach rule reads it, and the code for the title. */
  loadForPush: (
    db: Db,
    noteId: string,
  ) => Promise<{ note: NoteRow; authorName: string; record: NoteThreadRecord[K]; code: string } | null>;
  toRecord: (row: NoteRow, authorName: string) => NoteRecord[K];
};

/** The authors read is the same walk of `notes` for every kind, so a kind declares its table and gets it. */
function withAuthors<K extends NoteThreadKind>(store: Omit<NoteThreadStore<K>, 'authorsOf'>): NoteThreadStore<K> {
  const { table, threadColumn } = store.notes;
  return {
    ...store,
    authorsOf: async (db, threadId) => {
      const rows = await db.selectDistinct({ id: table.authorUserId }).from(table).where(eq(threadColumn, threadId));
      return rows.map(({ id }) => id);
    },
  };
}

/** Each Note Thread kind's tables and record gate; a new kind is a compile error until it has a row here. */
export const noteThreadStore: { [K in NoteThreadKind]: NoteThreadStore<K> } = {
  job: withAuthors<'job'>({
    notes: { table: contractingJobNotes, threadColumn: contractingJobNotes.jobId },
    lock: (tx, id, actor) => lockJobFor(tx, id, 'addNote', actor),
    insert: async (tx, { threadId, authorUserId, text }) => {
      const [note] = await tx.insert(contractingJobNotes).values({ jobId: threadId, authorUserId, text }).returning();
      if (!note) throw new Error('Job Note insert returned no row');
      return { ...note, threadId: note.jobId };
    },
    loadForPush: async (db, noteId) => {
      const [row] = await db
        .select({ note: contractingJobNotes, authorName: user.name, job: contractingJobs })
        .from(contractingJobNotes)
        .innerJoin(user, eq(user.id, contractingJobNotes.authorUserId))
        .innerJoin(contractingJobs, eq(contractingJobs.id, contractingJobNotes.jobId))
        .where(eq(contractingJobNotes.id, noteId));
      if (!row) return null;
      const { note, authorName, job } = row;
      return { note: { ...note, threadId: note.jobId }, authorName, record: job, code: formatJobNumber(job.code) };
    },
    toRecord: (row, authorName) =>
      JobNote.parse({
        id: row.id,
        jobId: row.threadId,
        authorUserId: row.authorUserId,
        authorName,
        text: row.text,
        createdAt: row.createdAt,
      }),
  }),
  breakdown: withAuthors<'breakdown'>({
    notes: { table: contractingBreakdownNotes, threadColumn: contractingBreakdownNotes.breakdownId },
    lock: (tx, id, actor) => lockBreakdownFor(tx, id, 'addNote', actor),
    insert: async (tx, { threadId, authorUserId, text }) => {
      const [note] = await tx
        .insert(contractingBreakdownNotes)
        .values({ breakdownId: threadId, authorUserId, text })
        .returning();
      if (!note) throw new Error('Breakdown Note insert returned no row');
      return { ...note, threadId: note.breakdownId };
    },
    loadForPush: async (db, noteId) => {
      const [row] = await db
        .select({ note: contractingBreakdownNotes, authorName: user.name })
        .from(contractingBreakdownNotes)
        .innerJoin(user, eq(user.id, contractingBreakdownNotes.authorUserId))
        .where(eq(contractingBreakdownNotes.id, noteId));
      if (!row) return null;
      const { note, authorName } = row;
      const [loaded] = await selectBreakdowns(db).where(eq(contractingBreakdowns.id, note.breakdownId)).limit(1);
      if (!loaded) return null;
      const breakdown = toBreakdownSummary(loaded);
      return {
        note: { ...note, threadId: note.breakdownId },
        authorName,
        record: breakdown,
        code: breakdown.subject.code,
      };
    },
    toRecord: (row, authorName) =>
      BreakdownNote.parse({
        id: row.id,
        breakdownId: row.threadId,
        authorUserId: row.authorUserId,
        authorName,
        text: row.text,
        createdAt: row.createdAt,
      }),
  }),
};
