import { shouldOfferQuoteCancellation } from '@pkg/domain';
import { QuoteCancellationReason, type QuoteDetail } from '@pkg/schema';
import { IconLoader2, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { CancellationChoice, describeSlotRelease, describeUnit } from '@/components/common/cancellation.js';
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
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

/**
 * The header action, for a Locked Quote. An unlocked one is cancelled from the status field instead,
 * which opens the same dialog — there is one way to cancel a Quote and this is its surface.
 */
export const QuoteCancellationAction: React.FC<{ canCancel: boolean; quote: QuoteDetail }> = ({ canCancel, quote }) => {
  if (!shouldOfferQuoteCancellation({ canCancel, quote })) {
    return null;
  }

  return (
    <QuoteCancellationDialog
      quote={quote}
      trigger={
        <Button type="button" variant="destructive">
          <IconTrash data-icon="inline-start" />
          Cancel Quote
        </Button>
      }
    />
  );
};

/**
 * Cancelling the sale, and deciding what that does to the records underneath it. The Job and the
 * machine are shown rather than described, and each is a choice: the server's plan says which arrive
 * ticked, because whether the shop has already touched the build is not something the browser knows.
 */
export function QuoteCancellationDialog({
  onOpenChange,
  open,
  quote,
  trigger,
}: {
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  quote: QuoteDetail;
  trigger?: React.ReactElement;
}) {
  const trpc = useTRPC();
  const { invalidateJobs, invalidateProductUnits, invalidateQuotes } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelJob, setCancelJob] = useState(true);
  const [removeUnit, setRemoveUnit] = useState(false);
  const dialogOpen = open ?? internalOpen;

  const planQuery = useQuery({
    ...trpc.quotes.cancellationPlan.queryOptions({ id: quote.id }),
    enabled: dialogOpen,
  });
  const plan = planQuery.data;
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  // The server's answer seeds the boxes exactly once per opening. A refetch — this app refetches on
  // window focus — must never re-tick a destructive box the person deliberately cleared.
  useEffect(() => {
    if (plan && !defaultsApplied) {
      setRemoveUnit(plan.unit?.removeByDefault ?? false);
      setDefaultsApplied(true);
    }
  }, [defaultsApplied, plan]);

  useEffect(() => {
    if (!dialogOpen) {
      setReason('');
      setCancelJob(true);
      setRemoveUnit(false);
      setDefaultsApplied(false);
    }
  }, [dialogOpen]);

  const setOpen = (nextOpen: boolean) => {
    onOpenChange?.(nextOpen);
    if (open === undefined) setInternalOpen(nextOpen);
  };

  const cancelMutation = useMutation(
    trpc.quotes.cancel.mutationOptions({
      onError: (error) => {
        showMutationError(error, 'Unable to cancel quote.');
      },
      onSuccess: async () => {
        setOpen(false);
        await Promise.all([invalidateQuotes(), invalidateJobs(), invalidateProductUnits()]);
        toast.success(`${quote.code} cancelled`);
      },
    }),
  );

  const parsedReason = QuoteCancellationReason.safeParse(reason);
  // Only the Job's own machine is ever on offer here, and only while that Job is going too.
  const unitOnOffer = cancelJob && plan?.unit?.canRemove === true ? plan.unit : null;
  // Nothing is confirmable until the plan lands: until then the dialog has not yet shown what it is
  // about to cancel, and submitting would carry choices nobody was offered.
  const isReady = plan !== undefined;

  return (
    <Dialog onOpenChange={setOpen} open={dialogOpen}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel quote</DialogTitle>
          <DialogDescription>This permanently cancels {quote.code}. This cannot be undone.</DialogDescription>
        </DialogHeader>

        {planQuery.isPending ? <p className="text-muted-foreground text-sm">Checking what this affects…</p> : null}

        {plan?.job ? (
          <CancellationChoice
            checked={cancelJob}
            description={`${describeSlotRelease(plan.job.releasableSlotCount)} Stock already checked out to it stays on its ledger.`}
            disabled={cancelMutation.isPending}
            id="quote-cancel-job"
            label={`Also cancel job ${plan.job.code}${plan.job.description ? ` (${plan.job.description})` : ''}`}
            onCheckedChange={(next) => {
              setCancelJob(next);
              if (!next) setRemoveUnit(false);
            }}
          />
        ) : null}

        {unitOnOffer ? (
          <CancellationChoice
            checked={removeUnit}
            description={describeUnit(unitOnOffer)}
            disabled={cancelMutation.isPending}
            id="quote-remove-unit"
            label={`Also remove unit ${unitOnOffer.productSerialNumber}`}
            onCheckedChange={setRemoveUnit}
          />
        ) : null}

        <QuoteCancellationReasonField disabled={cancelMutation.isPending} onChange={setReason} reason={reason} />
        <DialogFooter>
          <DialogClose render={<Button disabled={cancelMutation.isPending} type="button" variant="outline" />}>
            Keep quote
          </DialogClose>
          <Button
            disabled={!isReady || cancelMutation.isPending || !parsedReason.success}
            onClick={() => {
              if (parsedReason.success) {
                cancelMutation.mutate({
                  cancelJob,
                  cancellationReason: parsedReason.data,
                  id: quote.id,
                  removeUnit: unitOnOffer !== null && removeUnit,
                });
              }
            }}
            type="button"
            variant="destructive"
          >
            {cancelMutation.isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
            Cancel Quote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QuoteCancellationReasonField({
  disabled,
  onChange,
  reason,
}: {
  disabled: boolean;
  onChange: (reason: string) => void;
  reason: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="quote-cancellation-reason">Cancellation reason</FieldLabel>
      <Textarea
        autoFocus
        disabled={disabled}
        id="quote-cancellation-reason"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Explain why this quote is being cancelled…"
        rows={4}
        value={reason}
      />
    </Field>
  );
}
