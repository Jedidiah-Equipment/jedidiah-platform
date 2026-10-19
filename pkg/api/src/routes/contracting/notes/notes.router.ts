import { addNote } from '@pkg/core/contracting';
import { noteAdded } from '@pkg/domain/contracting';
import { NoteAddInput, type NoteThreadKind } from '@pkg/schema/contracting';
import type { Context } from '../../../trpc/context.js';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { businessProcedure, router } from '../../../trpc/init.js';
import { breakdownErrorFamily, jobErrorFamily } from '../contracting-error-families.js';
import type { ContractingPushScheduler } from '../contracting-push-scheduler.js';

/** Each kind's refusals are its record's own: a Job Note fails as a Job write, a Breakdown Note as a Breakdown write. */
const errorFamilies = { job: jobErrorFamily, breakdown: breakdownErrorFamily } as const;

/** Appends the entry under the record's lock and, once it is committed, schedules its push. */
export async function addThreadNote<K extends NoteThreadKind>(
  ctx: Pick<Context, 'db'> & { access: NonNullable<Context['access']> },
  push: ContractingPushScheduler,
  { thread, ...input }: { thread: K; id: NoteAddInput['id']; text: NoteAddInput['text'] },
): ReturnType<typeof addNote<K>> {
  const note = await mapCoreErrors(
    () => addNote({ db: ctx.db, actor: ctx.access, thread, input }),
    errorFamilies[thread],
  );
  push.schedule(noteAdded(thread, note.id));
  return note;
}

// The record's `addNote` Action is the gate, judged under its lock in core: it is open to every reader of the record.
export const createContractingNotesRouter = (push: ContractingPushScheduler) =>
  router({
    add: businessProcedure('contracting')
      .input(NoteAddInput)
      .mutation(({ ctx, input }) => addThreadNote(ctx, push, input)),
  });
