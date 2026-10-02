import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

/** Amend and re-verify an Hour Reading. Both move Job hours, so both refresh Jobs and readings; the caller shows the error. */
export function useReadingReview() {
  const trpc = useTRPC();
  const { invalidateJobs, invalidateReadings } = useQueryInvalidation();
  const invalidate = () => Promise.all([invalidateJobs(), invalidateReadings()]);
  return {
    amend: useMutation(
      trpc.contractingReadings.amend.mutationOptions({
        onSuccess: async () => {
          await invalidate();
          toast.success('Reading amended');
        },
      }),
    ),
    reverify: useMutation(trpc.contractingReadings.reverify.mutationOptions({ onSuccess: invalidate })),
  };
}
