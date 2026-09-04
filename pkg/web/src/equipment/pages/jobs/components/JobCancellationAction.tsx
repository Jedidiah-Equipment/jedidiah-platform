import { isJobCancellable } from '@pkg/domain';
import { JobCancellationReason, type JobDetail } from '@pkg/schema';
import { IconLoader2, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import { CancellationChoice, describeSlotRelease, describeUnit } from '@/equipment/components/common/cancellation.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

/**
 * Cancelling a Job outright, without touching its Quote. Hidden rather than disabled once the Job is
 * cancelled or completed: both states are already on the sheet, so a permanently dead button would
 * only be furniture.
 */
export const JobCancellationAction: React.FC<{ job: JobDetail }> = ({ job }) => {
  const trpc = useTRPC();
  const canCancel = useCan('equipment_job:cancel').can;
  const { invalidateInventory, invalidateJobs, invalidateProductUnits, invalidateQuotes } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [removeUnit, setRemoveUnit] = useState(false);

  const planQuery = useQuery({ ...trpc.jobs.cancellationPlan.queryOptions({ id: job.id }), enabled: isOpen });
  const plan = planQuery.data;
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setReason('');
      setRemoveUnit(false);
      setDefaultsApplied(false);
    }
  }, [isOpen]);

  // Whether the shop has already touched this build is the server's answer, not the browser's — and it
  // seeds the box once, so a refetch cannot re-tick a removal the person cleared.
  useEffect(() => {
    if (plan && !defaultsApplied) {
      setRemoveUnit(plan.unit?.removeByDefault ?? false);
      setDefaultsApplied(true);
    }
  }, [defaultsApplied, plan]);

  const cancelJobMutation = useMutation(
    trpc.jobs.cancel.mutationOptions({
      onSuccess: async () => {
        setIsOpen(false);
        // Cancelling releases the Job's outstanding stock commitment and drops it out of its Unit's
        // As-Built Spec and build state, so free stock and Unit reads move with it.
        await Promise.all([invalidateJobs(), invalidateInventory(), invalidateProductUnits(), invalidateQuotes()]);
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
  // Only a Stock Build's machine is ever on offer: while a Quote stands, the Unit is the sale's, and a
  // replacement Job will reuse it. The server refuses the request either way.
  const unitOnOffer = plan?.unit?.canRemove === true ? plan.unit : null;
  // Until the plan lands the dialog cannot say what cancelling releases, so it cannot be confirmed.
  const isReady = plan !== undefined;

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
              This permanently cancels {job.code}.{' '}
              {plan ? `${describeSlotRelease(plan.releasableSlotCount)} ` : 'Checking what this releases… '}
              Stock already checked out to it stays on its ledger.{' '}
              {/* A Stock Build has no sale behind it, so there is no Quote to reassure anyone about. */}
              {job.quoteCode === null ? null : 'The quote behind this Job is left alone. '}
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {unitOnOffer ? (
            <CancellationChoice
              checked={removeUnit}
              description={describeUnit(unitOnOffer)}
              disabled={cancelJobMutation.isPending}
              id="job-remove-unit"
              label={`Also remove unit ${unitOnOffer.productSerialNumber}`}
              onCheckedChange={setRemoveUnit}
            />
          ) : null}
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
              disabled={!isReady || cancelJobMutation.isPending || !parsedReason.success}
              onClick={() => {
                if (parsedReason.success) {
                  cancelJobMutation.mutate({
                    cancellationReason: parsedReason.data,
                    id: job.id,
                    removeUnit: unitOnOffer !== null && removeUnit,
                  });
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
