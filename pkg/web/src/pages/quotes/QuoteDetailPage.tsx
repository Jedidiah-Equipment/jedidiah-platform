import { hasPermission } from '@pkg/domain';
import type { QuoteDetail, UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon, BriefcaseBusinessIcon, CalendarIcon, EditIcon, Loader2Icon, XIcon } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PrimaryLink } from '@/components/PrimaryLink.js';
import { Button } from '@/components/ui/button.js';
import { Calendar } from '@/components/ui/calendar.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { Separator } from '@/components/ui/separator.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatDate } from '@/utils/date.js';
import { formatCurrency } from '@/utils/number.js';
import { QuoteStatusBadge, quoteStatusLabels } from './components/QuoteStatusBadge.js';
import { useQuoteStateMutation } from './hooks/use-quote-state-mutation.js';

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessQuery = useAccess();
  const [confirmation, setConfirmation] = useState<QuoteTransitionConfirmation | null>(null);

  const quoteQuery = useQuery(trpc.quotes.get.queryOptions({ id: quoteId }));
  const quote = quoteQuery.data;

  const sendMutation = useQuoteStateMutation({ action: 'send', successMessage: 'Quote sent' });
  const acceptMutation = useQuoteStateMutation({ action: 'accept', successMessage: 'Quote accepted' });
  const rejectMutation = useQuoteStateMutation({ action: 'reject', successMessage: 'Quote rejected' });

  const createJobMutation = useMutation(
    trpc.jobs.createFromQuote.mutationOptions({
      onSuccess: async (job) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.jobs.pathKey() }),
        ]);
        toast.success('Job created');
        await navigate({ params: { id: job.id }, to: '/jobs/$id' });
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const currencyCode = quote?.quotedCurrencyCode ?? quote?.productCurrencyCode;

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
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div>
        <Button render={<Link to="/quotes" />} variant="ghost">
          <ArrowLeftIcon data-icon="inline-start" />
          Quotes
        </Button>
      </div>
      <Card>
        <CardHeader>
          {quote ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1">
                <CardDescription>{quote.code}</CardDescription>
                <CardTitle>{quote.customerCompanyName}</CardTitle>
              </div>
              <QuoteStatusBadge status={quote.status} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-64" />
            </div>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Separator />
          {quoteQuery.error ? <p className="text-sm text-destructive">{quoteQuery.error.message}</p> : null}
          {quote ? (
            <>
              <div className="flex flex-wrap gap-2">
                {canUpdateQuote && quote.status === 'draft' ? (
                  <Button render={<Link params={{ id: quote.id }} to="/quotes/$id/edit" />} variant="outline">
                    <EditIcon data-icon="inline-start" />
                    Edit
                  </Button>
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
                      {acceptMutation.isPending ? (
                        <Loader2Icon data-icon="inline-start" className="animate-spin" />
                      ) : null}
                      Accept
                    </Button>
                    <Button disabled={isStatePending} onClick={() => confirmRejectQuote(quote.id)} variant="outline">
                      Reject
                    </Button>
                  </>
                ) : null}
                {canCreateJob && quote.status === 'accepted' && !quote.jobId ? (
                  <CreateJobFromQuoteDialog
                    isPending={createJobMutation.isPending}
                    onCreate={(dueDate) => createJobMutation.mutate({ quoteId: quote.id, dueDate })}
                  />
                ) : null}
              </div>
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <QuoteFact label="Status" value={quoteStatusLabels[quote.status]} />
                <QuoteFact label="Product" value={`${quote.productName} (${quote.productModelCode})`} />
                <QuoteFact label="Salesperson" value={quote.salesPersonName ?? 'Unassigned'} />
                <QuoteFact label="Valid until" value={formatDate(quote.validUntil, 'short', 'Not set')} />
                <QuoteFact label="Sent" value={formatDate(quote.sentAt, 'medium', 'Not sent')} />
                <QuoteFact label="Total" value={formatCurrency(quote.total, currencyCode)} />
                <QuoteFact label="Discount" value={formatCurrency(quote.discount, currencyCode)} />
                <QuoteFact
                  label="Quoted base price"
                  value={
                    quote.quotedBasePrice === null
                      ? 'Not snapshotted'
                      : formatCurrency(quote.quotedBasePrice, currencyCode)
                  }
                />
                <QuoteFact
                  label="Job"
                  value={<QuoteJobLink canOpenJob={canOpenJobs} jobCode={quote.jobCode} jobId={quote.jobId} />}
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
        </CardContent>
      </Card>
      <QuoteTransitionConfirmationDialog
        confirmation={confirmation}
        isPending={isStatePending}
        onClose={() => setConfirmation(null)}
      />
    </div>
  );
};

const QuoteFact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-md border p-3">
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <div className="mt-1 wrap-break-word">{value}</div>
  </div>
);

const QuoteJobLink: React.FC<{
  canOpenJob: boolean;
  jobCode: QuoteDetail['jobCode'];
  jobId: QuoteDetail['jobId'];
}> = ({ canOpenJob, jobCode, jobId }) => {
  if (!jobCode) {
    return <span className="text-muted-foreground">None</span>;
  }

  if (canOpenJob && jobId) {
    return (
      <PrimaryLink params={{ id: jobId }} to="/jobs/$id">
        {jobCode}
      </PrimaryLink>
    );
  }

  return <span className="font-medium">{jobCode}</span>;
};

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

const CreateJobFromQuoteDialog: React.FC<{
  isPending: boolean;
  onCreate: (dueDate: string | null) => void;
}> = ({ isPending, onCreate }) => {
  const [dueDate, setDueDate] = useState('');
  const selectedDueDate = parseDateInputValue(dueDate);

  return (
    <Dialog>
      <DialogTrigger render={<Button />}>
        <BriefcaseBusinessIcon data-icon="inline-start" />
        Create job
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create job from quote</DialogTitle>
          <DialogDescription className="flex flex-col gap-2">
            <span>This will create a Job from the accepted Quote with the standard production stages.</span>
            <span>The Quote will stay accepted and visible for history, and the new Job will link back to it.</span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <div className="text-sm font-medium">Due date</div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    className="min-w-0 flex-1 justify-start text-left font-normal data-[empty=true]:text-muted-foreground"
                    data-empty={!selectedDueDate}
                    type="button"
                    variant="outline"
                  />
                }
              >
                <CalendarIcon data-icon="inline-start" />
                <span className="min-w-0 truncate">{formatDate(dueDate || null, 'short', 'No due date')}</span>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  onSelect={(date) => setDueDate(date ? getDateInputValue(date) : '')}
                  selected={selectedDueDate}
                />
              </PopoverContent>
            </Popover>
            <Button
              aria-label="Clear due date"
              disabled={!dueDate}
              onClick={() => setDueDate('')}
              size="icon"
              type="button"
              variant="outline"
            >
              <XIcon />
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={isPending} onClick={() => onCreate(dueDate || null)}>
            {isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
            Create job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

function parseDateInputValue(value: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const [year, month, day] = value.split('-').map(Number);

  if (year === undefined || month === undefined || day === undefined) {
    return undefined;
  }

  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
