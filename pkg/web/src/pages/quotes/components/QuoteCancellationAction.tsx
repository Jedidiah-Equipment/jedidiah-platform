import { isQuoteLocked } from '@pkg/domain';
import { QuoteCancellationReason, type QuoteKind, type QuoteLinkedJob, type QuoteStatus } from '@pkg/schema';
import { IconLoader2, IconTrash } from '@tabler/icons-react';
import type React from 'react';
import { useEffect, useState } from 'react';

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

type QuoteCancellationActionProps = {
  canCancel: boolean;
  isPending: boolean;
  job: QuoteLinkedJob | null;
  kind: QuoteKind;
  onConfirm: (cancellationReason: string) => void;
  status: QuoteStatus;
};

export const QuoteCancellationAction: React.FC<QuoteCancellationActionProps> = ({
  canCancel,
  isPending,
  job,
  kind,
  onConfirm,
  status,
}) => {
  if (!canCancel || status === 'cancelled' || !isQuoteLocked({ hasJob: job !== null, kind, status })) {
    return null;
  }

  const copy = getQuoteCancellationDialogCopy(job);

  return (
    <QuoteCancellationDialog
      copy={copy}
      isPending={isPending}
      onConfirm={onConfirm}
      trigger={
        <Button type="button" variant="destructive">
          <IconTrash data-icon="inline-start" />
          {copy.triggerLabel}
        </Button>
      }
    />
  );
};

export function QuoteCancellationDialog({
  copy,
  isPending,
  onConfirm,
  onOpenChange,
  open,
  trigger,
}: {
  copy: ReturnType<typeof getQuoteCancellationDialogCopy>;
  isPending: boolean;
  onConfirm: (cancellationReason: string) => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  trigger?: React.ReactElement;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [reason, setReason] = useState('');
  const dialogOpen = open ?? internalOpen;

  useEffect(() => {
    if (!dialogOpen) setReason('');
  }, [dialogOpen]);

  const setOpen = (nextOpen: boolean) => {
    if (!nextOpen) setReason('');
    onOpenChange?.(nextOpen);
    if (open === undefined) setInternalOpen(nextOpen);
  };

  return (
    <Dialog onOpenChange={setOpen} open={dialogOpen}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <QuoteCancellationReasonField disabled={isPending} onChange={setReason} reason={reason} />
        <DialogFooter>
          <DialogClose render={<Button disabled={isPending} type="button" variant="outline" />}>Keep quote</DialogClose>
          <QuoteCancellationConfirmButton
            confirmLabel={copy.confirmLabel}
            isPending={isPending}
            onConfirm={onConfirm}
            reason={reason}
          />
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

export function QuoteCancellationConfirmButton({
  confirmLabel,
  isPending,
  onConfirm,
  reason,
}: {
  confirmLabel: string;
  isPending: boolean;
  onConfirm: (cancellationReason: string) => void;
  reason: string;
}) {
  const parsedReason = QuoteCancellationReason.safeParse(reason);

  return (
    <Button
      disabled={isPending || !parsedReason.success}
      onClick={() => {
        if (parsedReason.success) onConfirm(parsedReason.data);
      }}
      type="button"
      variant="destructive"
    >
      {isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
      {confirmLabel}
    </Button>
  );
}

export function getQuoteCancellationDialogCopy(job: QuoteLinkedJob | null) {
  if (!job) {
    return {
      confirmLabel: 'Cancel Quote',
      description: 'This permanently cancels the quote. This cannot be undone.',
      title: 'Cancel quote',
      triggerLabel: 'Cancel Quote',
    } as const;
  }

  const description = job.jobDescription ?? 'no description';

  return {
    confirmLabel: 'Cancel Quote and Job',
    description: `This permanently cancels the quote and Job ${job.jobCode} (${description}). Future slots are removed from bay schedules; past work stays on record. This cannot be undone.`,
    title: 'Cancel quote and job',
    triggerLabel: 'Cancel Quote and Job',
  } as const;
}
