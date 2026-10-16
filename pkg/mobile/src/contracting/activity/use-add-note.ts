import type { UUID } from '@pkg/schema';
import type {
  BreakdownNote,
  BreakdownNoteCreateInput,
  JobNote,
  JobNoteCreateInput,
  NoteThreadKind,
} from '@pkg/schema/contracting';
import { type UseMutationOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppToast } from '@/components/ui/toast';
import { useTRPC } from '@/lib/trpc';
import { useBusyAction } from '@/lib/use-busy-action';

const NOTE_SAVE_FAILED = 'Could not add the note. Check your connection and try again.';

/** The record whose Note Thread an entry joins; `code` names it in a subtitle. */
export type NoteThreadRef = { kind: NoteThreadKind; id: UUID; code: string };

/** Appends an entry to a record's Note Thread through that kind's own procedure, then refreshes what it moves. */
export function useAddNote(thread: NoteThreadRef) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showToast = useAppToast();
  const { busy, error, run } = useBusyAction();
  const client = {
    // A Job Note changes nothing on the Job; a Breakdown Note moves the Breakdown's note count.
    job: {
      options: trpc.contractingJobs.notes.add.mutationOptions,
      input: (text: string) => ({ jobId: thread.id, text }),
      voicePurpose: 'job note',
      invalidate: () =>
        queryClient.invalidateQueries({ queryKey: trpc.contractingJobs.jobs.get.queryKey({ id: thread.id }) }),
    },
    breakdown: {
      options: trpc.contractingBreakdowns.notes.add.mutationOptions,
      input: (text: string) => ({ breakdownId: thread.id, text }),
      voicePurpose: 'breakdown note',
      invalidate: () => queryClient.invalidateQueries({ queryKey: trpc.contractingBreakdowns.pathKey() }),
    },
  }[thread.kind];
  // The two procedures differ only in how their input names the record, so one mutation serves either kind. Its
  // variables stay the procedure's own input: mobile analytics reads the record id off them.
  const mutation = useMutation(
    client.options() as UseMutationOptions<
      JobNote | BreakdownNote,
      unknown,
      JobNoteCreateInput | BreakdownNoteCreateInput
    >,
  );
  return {
    voicePurpose: client.voicePurpose,
    busy,
    error,
    /** Sends the note; `onSent` runs once it is saved, before the refresh. */
    send: (text: string, onSent: () => void) =>
      run(async () => {
        await mutation.mutateAsync(client.input(text));
        onSent();
        showToast('success', 'Note added');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.contractingActivity.pathKey() }),
          client.invalidate(),
        ]);
      }, NOTE_SAVE_FAILED),
  };
}
