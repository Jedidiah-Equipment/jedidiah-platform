import { hasPermission } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon, BriefcaseBusinessIcon, EditIcon, Loader2Icon } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
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

export const QuoteDetailPage: React.FC<QuoteDetailPageProps> = ({ quoteId }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessQuery = useAccess();

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

  const canUpdateQuote = hasPermission(accessQuery.data, 'quote:update');
  const canCreateJob = hasPermission(accessQuery.data, 'job:create');
  const isStatePending = sendMutation.isPending || acceptMutation.isPending || rejectMutation.isPending;

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
                  <Button disabled={isStatePending} onClick={() => sendMutation.mutate({ id: quote.id })}>
                    {sendMutation.isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
                    Send
                  </Button>
                ) : null}
                {canUpdateQuote && quote.status === 'sent' ? (
                  <>
                    <Button disabled={isStatePending} onClick={() => acceptMutation.mutate({ id: quote.id })}>
                      {acceptMutation.isPending ? (
                        <Loader2Icon data-icon="inline-start" className="animate-spin" />
                      ) : null}
                      Accept
                    </Button>
                    <Button
                      disabled={isStatePending}
                      onClick={() => rejectMutation.mutate({ id: quote.id })}
                      variant="outline"
                    >
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
                <QuoteFact label="Total" value={`R ${formatCurrency(quote.total)}`} />
                <QuoteFact label="Discount" value={`R ${formatCurrency(quote.discount)}`} />
                <QuoteFact
                  label="Quoted base price"
                  value={
                    quote.quotedBasePrice === null ? 'Not snapshotted' : `R ${formatCurrency(quote.quotedBasePrice)}`
                  }
                />
                <QuoteFact label="Converted job" value={quote.jobId ? 'Created' : 'None'} />
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
    </div>
  );
};

const QuoteFact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-md border p-3">
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <div className="mt-1 wrap-break-word">{value}</div>
  </div>
);

const CreateJobFromQuoteDialog: React.FC<{
  isPending: boolean;
  onCreate: (dueDate: string | null) => void;
}> = ({ isPending, onCreate }) => {
  const [dueDate, setDueDate] = useState('');

  return (
    <Dialog>
      <DialogTrigger render={<Button />}>
        <BriefcaseBusinessIcon data-icon="inline-start" />
        Create job
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create job from quote</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="job-due-date">Due date</Label>
          <Input id="job-due-date" onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} />
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
