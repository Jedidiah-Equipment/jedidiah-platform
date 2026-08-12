import { isJobCancellable } from '@pkg/domain';
import { JobCancellationReason, type JobDetail } from '@pkg/schema';
import { IconLoader2, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Textarea } from '@/components/ui/textarea.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

/**
 * Cancelling a Job outright, without touching its Quote. Hidden rather than disabled once the Job is
 * cancelled or completed: both states are already on the sheet, so a permanently dead button would
 * only be furniture.
 */
export const JobCancellationAction: React.FC<{ job: JobDetail }> = ({ job }) => {
  const trpc = useTRPC();
  const canCancel = useCan('job:cancel').can;
  const { invalidateInventory, invalidateJobs, invalidateProductUnits } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!isOpen) setReason('');
  }, [isOpen]);

  const cancelJobMutation = useMutation(
    trpc.jobs.cancel.mutationOptions({
      onSuccess: async () => {
        setIsOpen(false);
        // Cancelling releases the Job's outstanding stock commitment and drops it out of its Unit's
        // As-Built Spec and build state, so free stock and Unit reads move with it.
        await Promise.all([invalidateJobs(), invalidateInventory(), invalidateProductUnits()]);
        toast.success(`${job.code} cancelled`);
      },
      onError: (error) => {
        showMutationError(error, 'Unable to cancel job.');
      },
    }),
  );

  if (!canCancel || !isJobCancellable(job)) {
    return null;
  }

  const parsedReason = JobCancellationReason.safeParse(reason);

  return (
    <div className="mt-4 flex justify-end border-t pt-4">
      <Dialog onOpenChange={setIsOpen} open={isOpen}>
        <DialogTrigger render={<Button type="button" variant="destructive" />}>
          <IconTrash data-icon="inline-start" />
          Cancel Job
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel job</DialogTitle>
            <DialogDescription>
              This permanently cancels {job.code}. {describeSlotRelease(countScheduledSlots(job))} Stock already checked
              out to it stays on its ledger.{' '}
              {/* A Stock Build has no sale behind it, so there is no Quote to reassure anyone about. */}
              {job.quoteCode === null ? null : 'The quote behind this Job is left alone. '}
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="job-cancellation-reason">Cancellation reason</FieldLabel>
            <Textarea
              autoFocus
              disabled={cancelJobMutation.isPending}
              id="job-cancellation-reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why this job is being cancelled…"
              rows={4}
              value={reason}
            />
          </Field>
          <DialogFooter>
            <DialogClose render={<Button disabled={cancelJobMutation.isPending} type="button" variant="outline" />}>
              Keep job
            </DialogClose>
            <Button
              disabled={cancelJobMutation.isPending || !parsedReason.success}
              onClick={() => {
                if (parsedReason.success) {
                  cancelJobMutation.mutate({ cancellationReason: parsedReason.data, id: job.id });
                }
              }}
              type="button"
              variant="destructive"
            >
              {cancelJobMutation.isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
              Cancel Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/** Slots that have not started yet are the only ones cancellation gives back. */
function countScheduledSlots(job: JobDetail): number {
  return job.schedule.reduce(
    (total, department) =>
      total +
      department.bays.reduce(
        (bayTotal, bay) => bayTotal + bay.slots.filter((slot) => slot.state === 'scheduled').length,
        0,
      ),
    0,
  );
}

function describeSlotRelease(scheduledSlots: number): string {
  if (scheduledSlots === 0) {
    return 'It has no upcoming slots to release, and any work already done or under way stays on record.';
  }

  const slotLabel = scheduledSlots === 1 ? 'slot' : 'slots';

  return `${scheduledSlots} upcoming ${slotLabel} ${scheduledSlots === 1 ? 'is' : 'are'} removed from bay schedules; work already done or under way stays on record.`;
}
