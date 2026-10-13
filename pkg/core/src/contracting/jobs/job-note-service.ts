import { type Db, user } from '@pkg/db';
import { contractingJobNotes } from '@pkg/db/contracting';
import type { JobActor } from '@pkg/domain/contracting';
import { JobNote, JobNoteCreateInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { lockJobFor } from './job-lock.js';

/**
 * Appends a Job Note under the Job's lock, gated by the Job Action `addNote`. Notes are authored and append-only,
 * so not audited, like Breakdown Notes.
 */
export async function addJobNote({
  db,
  actor,
  input: raw,
}: {
  db: Db;
  actor: JobActor;
  input: JobNoteCreateInput;
}): Promise<JobNote> {
  const input = JobNoteCreateInput.parse(raw);
  return db.transaction(async (tx) => {
    const job = await lockJobFor(tx, input.jobId, 'addNote', actor);
    const [note] = await tx
      .insert(contractingJobNotes)
      .values({ jobId: job.id, authorUserId: actor.userId, text: input.text })
      .returning();
    if (!note) throw new Error('Job Note insert returned no row');
    const [author] = await tx.select({ name: user.name }).from(user).where(eq(user.id, actor.userId));
    return JobNote.parse({
      id: note.id,
      jobId: note.jobId,
      authorUserId: note.authorUserId,
      authorName: author?.name ?? '',
      text: note.text,
      createdAt: note.createdAt,
    });
  });
}
