import type { UUID } from '@pkg/schema';
import type { NoteThreadKind } from '@pkg/schema/contracting';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppToast } from '@/components/ui/toast';
import { useTRPC } from '@/lib/trpc';
import { useBusyAction } from '@/lib/use-busy-action';

const NOTE_SAVE_FAILED = 'Could not add the note. Check your connection and try again.';

/** The record whose Note Thread an entry joins; `code` names it in a subtitle. */
export type NoteThreadRef = { kind: NoteThreadKind; id: UUID; code: string };

/** Appends an entry to a record's Note Thread, then refreshes what it moves. */
export function useAddNote(thread: NoteThreadRef) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showToast = useAppToast();
  const { busy, error, run } = useBusyAction();
  // A Job Note changes nothing on the Job; a Breakdown Note moves the Breakdown's note count.
  const invalidate = {
    job: () => queryClient.invalidateQueries({ queryKey: trpc.contractingJobs.jobs.get.queryKey({ id: thread.id }) }),
    breakdown: () => queryClient.invalidateQueries({ queryKey: trpc.contractingBreakdowns.pathKey() }),
  }[thread.kind];
  const mutation = useMutation(trpc.contractingNotes.add.mutationOptions());
  return {
    voicePurpose: `${thread.kind} note`,
    busy,
    error,
    /** Sends the note; `onSent` runs once it is saved, before the refresh. */
    send: (text: string, onSent: () => void) =>
      run(async () => {
        await mutation.mutateAsync({ thread: thread.kind, id: thread.id, text });
        onSent();
        showToast('success', 'Note added');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.contractingActivity.pathKey() }),
          invalidate(),
        ]);
      }, NOTE_SAVE_FAILED),
  };
}
