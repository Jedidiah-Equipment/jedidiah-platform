import { isQuoteLocked } from '@pkg/domain';
import type { QuoteKind, QuoteLinkedJob, QuoteStatus } from '@pkg/schema';
import type React from 'react';

import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';

type QuoteCancellationActionProps = {
  canCancel: boolean;
  isPending: boolean;
  job: QuoteLinkedJob | null;
  kind: QuoteKind;
  onConfirm: () => void;
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
    <RemoveEntityButton
      confirmLabel={copy.confirmLabel}
      description={copy.description}
      isPending={isPending}
      onConfirm={onConfirm}
      title={copy.title}
      triggerLabel={copy.triggerLabel}
    />
  );
};

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
