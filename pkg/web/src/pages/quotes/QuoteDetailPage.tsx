import { hasPermission } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { BriefcaseBusinessIcon, EditIcon, Loader2Icon } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

import { BackButton } from '@/components/button/BackButton.js';
import { ButtonLink } from '@/components/button/ButtonLink.js';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DetailPageLayout } from '@/components/page-layout/DetailPageLayout.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { CreateJobDialog } from '@/pages/jobs/components/CreateJobDialog.js';
import { JobCodeDisplay } from '@/pages/jobs/components/JobCodeDisplay.js';
import { formatCurrency } from '@/utils/number.js';
import { QuoteStatusBadge, quoteStatusLabels } from './components/QuoteStatusBadge.js';
import { useQuoteStateMutation } from './hooks/use-quote-state-mutation.js';
import { canCreateJobFromQuote } from './quote-job-eligibility.js';

type QuoteDetailPageProps = {
  quoteId: UUID;
};

type QuoteTransitionConfirmation = {
  body: string[];
  confirmLabel: string;
  confirmVariant: React.ComponentProps<typeof Button>['variant'];
  onConfirm: () => void;
  title: string;
};

export const QuoteDetailPage: React.FC<QuoteDetailPageProps> = ({ quoteId }) => {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const [confirmation, setConfirmation] = useState<QuoteTransitionConfirmation | null>(null);

  const quoteQuery = useQuery(trpc.quotes.get.queryOptions({ id: quoteId }));
  const quote = quoteQuery.data;

  const sendMutation = useQuoteStateMutation({ action: 'send', successMessage: 'Quote sent' });
  const acceptMutation = useQuoteStateMutation({ action: 'accept', successMessage: 'Quote accepted' });
  const rejectMutation = useQuoteStateMutation({ action: 'reject', successMessage: 'Quote rejected' });

  const currencyCode = quote?.quotedCurrencyCode ?? quote?.productCurrencyCode ?? undefined;

  const canUpdateQuote = hasPermission(accessQuery.data, 'quote:update');
  const canCreateJob = hasPermission(accessQuery.data, 'job:create');
  const canOpenJobs = hasPermission(accessQuery.data, 'job:read') || hasPermission(accessQuery.data, 'job:update');
  const isStatePending = sendMutation.isPending || acceptMutation.isPending || rejectMutation.isPending;
  const confirmSendQuote = (id: UUID) => {
    setConfirmation({
      body: [
        'This will send the Quote and freeze it at the current product price and currency.',
        'After sending, the Quote cannot be edited. It can only be accepted or rejected.',
      ],
      confirmLabel: 'Send quote',
      confirmVariant: 'default',
      onConfirm: () => sendMutation.mutate({ id }),
      title: 'Send quote?',
    });
  };
  const confirmAcceptQuote = (id: UUID) => {
    setConfirmation({
      body: [
        'This will mark the Quote as accepted.',
        'After acceptance, the Quote cannot be rejected or edited. A Job can be created from it by someone with Job creation access.',
      ],
      confirmLabel: 'Accept quote',
      confirmVariant: 'default',
      onConfirm: () => acceptMutation.mutate({ id }),
      title: 'Accept quote?',
    });
  };
  const confirmRejectQuote = (id: UUID) => {
    setConfirmation({
      body: [
        'This will mark the Quote as rejected.',
        'After rejection, the Quote cannot be accepted, edited, or converted into a Job. It will stay visible for history.',
      ],
      confirmLabel: 'Reject quote',
      confirmVariant: 'destructive',
      onConfirm: () => rejectMutation.mutate({ id }),
      title: 'Reject quote?',
    });
  };

  return (
    <DetailPageLayout
      back={<BackButton to="/quotes">Quotes</BackButton>}
      badge={quote ? <QuoteStatusBadge status={quote.status} /> : undefined}
      description={quote?.code}
      title={quote?.customerCompanyName}
    >
      <ErrorMessage error={quoteQuery.error} fallbackMessage="Unable to load quote." />
      {quote ? (
        <>
          <div className="flex flex-wrap gap-2">
            {canUpdateQuote && quote.status === 'draft' ? (
              <ButtonLink params={{ id: quote.id }} to="/quotes/$id/edit" variant="outline">
                <EditIcon data-icon="inline-start" />
                Edit
              </ButtonLink>
            ) : null}
            {canUpdateQuote && quote.status === 'draft' ? (
              <Button disabled={isStatePending} onClick={() => confirmSendQuote(quote.id)}>
                {sendMutation.isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
                Send
              </Button>
            ) : null}
            {canUpdateQuote && quote.status === 'sent' ? (
              <>
                <Button disabled={isStatePending} onClick={() => confirmAcceptQuote(quote.id)}>
                  {acceptMutation.isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
                  Accept
                </Button>
                <Button disabled={isStatePending} onClick={() => confirmRejectQuote(quote.id)} variant="outline">
                  Reject
                </Button>
              </>
            ) : null}
            {canCreateJob && canCreateJobFromQuote({ jobId: quote.jobId, status: quote.status }) ? (
              <CreateJobDialog
                quote={quote}
                trigger={
                  <Button>
                    <BriefcaseBusinessIcon data-icon="inline-start" />
                    Create job
                  </Button>
                }
              />
            ) : null}
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <QuoteFact label="Status" value={quoteStatusLabels[quote.status]} />
            <QuoteFact
              label="Product"
              value={quote.productName ? `${quote.productName} (${quote.productModelCode})` : 'Not set'}
            />
            <QuoteFact label="Salesperson" value={quote.salesPersonName ?? 'Unassigned'} />
            <QuoteFact label="Valid until" value={<DateDisplay date={quote.validUntil} emptyValue="Not set" />} />
            <QuoteFact label="Sent" value={<DateDisplay date={quote.sentAt} emptyValue="Not sent" format="medium" />} />
            <QuoteFact
              label="Total"
              value={quote.total === null ? 'Not set' : formatCurrency(quote.total, currencyCode)}
            />
            <QuoteFact label="Discount" value={formatCurrency(quote.discount, currencyCode)} />
            <QuoteFact
              label="Quoted base price"
              value={
                quote.quotedBasePrice === null ? 'Not snapshotted' : formatCurrency(quote.quotedBasePrice, currencyCode)
              }
            />
            <QuoteFact
              label="Job"
              value={
                <JobCodeDisplay canOpenJob={canOpenJobs} jobCode={quote.jobCode} jobId={quote.jobId} withHoverCard />
              }
            />
          </div>
          {quote.notes ? (
            <div className="rounded-md border p-3 text-sm">
              <div className="mb-1 font-medium">Notes</div>
              <p className="whitespace-pre-wrap text-muted-foreground">{quote.notes}</p>
            </div>
          ) : null}
        </>
      ) : null}
      {quoteQuery.isLoading ? <Skeleton className="h-40" /> : null}
      <QuoteTransitionConfirmationDialog
        confirmation={confirmation}
        isPending={isStatePending}
        onClose={() => setConfirmation(null)}
      />
    </DetailPageLayout>
  );
};

const QuoteFact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-md border p-3">
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <div className="mt-1 wrap-break-word">{value}</div>
  </div>
);

const QuoteTransitionConfirmationDialog: React.FC<{
  confirmation: QuoteTransitionConfirmation | null;
  isPending: boolean;
  onClose: () => void;
}> = ({ confirmation, isPending, onClose }) => (
  <Dialog onOpenChange={(isOpen) => !isOpen && onClose()} open={Boolean(confirmation)}>
    <DialogContent className="sm:max-w-lg">
      {confirmation ? (
        <>
          <DialogHeader>
            <DialogTitle>{confirmation.title}</DialogTitle>
            <DialogDescription className="flex flex-col gap-2">
              {confirmation.body.map((paragraph) => (
                <span key={paragraph}>{paragraph}</span>
              ))}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={isPending} onClick={onClose} type="button" variant="outline">
              Keep quote
            </Button>
            <Button
              disabled={isPending}
              onClick={() => {
                const action = confirmation.onConfirm;
                onClose();
                action();
              }}
              type="button"
              variant={confirmation.confirmVariant}
            >
              {confirmation.confirmLabel}
            </Button>
          </DialogFooter>
        </>
      ) : null}
    </DialogContent>
  </Dialog>
);
