import type { UUID } from '@pkg/schema';
import type { NoteThreadKind } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

/** The record whose Note Thread an entry joins; `code` names it in a subtitle. */
export type NoteThreadRef = { kind: NoteThreadKind; id: UUID; code: string };

/** Appends an entry to a record's Note Thread, then refreshes what it moves. */
export function useAddNote(thread: NoteThreadRef) {
  const trpc = useTRPC();
  const { invalidateActivity, invalidateJobs, invalidateWorkshop } = useQueryInvalidation();
  // A Job Note refreshes the Job's own reads beside Activity; Workshop refreshes carry Activity already.
  const invalidate = {
    job: () => Promise.all([invalidateJobs(), invalidateActivity()]),
    breakdown: invalidateWorkshop,
  }[thread.kind];
  const write = useContractingWrite(invalidate);
  const mutation = useMutation(
    trpc.contractingNotes.add.mutationOptions({
      onSuccess: async () => {
        await write.invalidate();
        toast.success('Note added');
      },
      onError: write.report,
    }),
  );
  return {
    send: (text: string) => mutation.mutateAsync({ thread: thread.kind, id: thread.id, text }),
    error: mutation.error,
    reset: mutation.reset,
  };
}
