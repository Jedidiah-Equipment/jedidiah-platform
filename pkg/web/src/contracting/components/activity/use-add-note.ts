import type { UUID } from '@pkg/schema';
import type {
  BreakdownNote,
  BreakdownNoteCreateInput,
  JobNote,
  JobNoteCreateInput,
  NoteThreadKind,
} from '@pkg/schema/contracting';
import { type UseMutationOptions, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

/** The record whose Note Thread an entry joins; `code` names it in a subtitle. */
export type NoteThreadRef = { kind: NoteThreadKind; id: UUID; code: string };

/** Appends an entry to a record's Note Thread through that kind's own procedure, then refreshes what it moves. */
export function useAddNote(thread: NoteThreadRef) {
  const trpc = useTRPC();
  const { invalidateActivity, invalidateJobs, invalidateWorkshop } = useQueryInvalidation();
  const client = {
    // A Job Note refreshes the Job's own reads beside Activity; Workshop refreshes carry Activity already.
    job: {
      options: trpc.contractingJobs.notes.add.mutationOptions,
      invalidate: () => Promise.all([invalidateJobs(), invalidateActivity()]),
      input: (text: string) => ({ jobId: thread.id, text }),
    },
    breakdown: {
      options: trpc.contractingBreakdowns.notes.add.mutationOptions,
      invalidate: invalidateWorkshop,
      input: (text: string) => ({ breakdownId: thread.id, text }),
    },
  }[thread.kind];
  const write = useContractingWrite(client.invalidate);
  // The two procedures differ only in how their input names the record, so one mutation serves either kind.
  const options = client.options({
    onSuccess: async () => {
      await write.invalidate();
      toast.success('Note added');
    },
    onError: write.report,
  }) as UseMutationOptions<JobNote | BreakdownNote, unknown, JobNoteCreateInput | BreakdownNoteCreateInput>;
  const mutation = useMutation(options);
  return {
    send: (text: string) => mutation.mutateAsync(client.input(text)),
    error: mutation.error,
    reset: mutation.reset,
  };
}
