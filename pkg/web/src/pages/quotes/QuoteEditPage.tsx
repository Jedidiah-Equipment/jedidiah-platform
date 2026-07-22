import { getQuoteOfferingName } from '@pkg/domain';
import type { PriorityQuote, UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { QuoteForm } from './components/form/QuoteForm.js';
import { QuoteCancellationAction } from './components/QuoteCancellationAction.js';
import { QuoteStatusBadge } from './components/QuoteStatusBadge.js';

type QuoteEditPageProps = {
  quoteId: UUID;
};

export const QuoteEditPage: React.FC<QuoteEditPageProps> = ({ quoteId }) => {
  const trpc = useTRPC();
  const canCancelQuote = useCan('quote:cancel').can;
  const { invalidateJobs, invalidateQuotes } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const quoteQuery = useQuery(trpc.quotes.get.queryOptions({ id: quoteId }));
  const priorityQuotesQuery = useQuery(trpc.quotes.priorityList.queryOptions());
  const quote = quoteQuery.data;
  const priorityQuote: PriorityQuote | null =
    priorityQuotesQuery.data?.find((priorityQuote) => priorityQuote.id === quoteId) ?? null;
  const updateMutation = useMutation(
    trpc.quotes.update.mutationOptions({
      onSuccess: async () => {
        await invalidateQuotes();
      },
    }),
  );
  const cancelMutation = useMutation(
    trpc.quotes.cancel.mutationOptions({
      onError: (error) => {
        showMutationError(error, 'Unable to cancel quote.');
      },
      onSuccess: async () => {
        await Promise.all([invalidateQuotes(), invalidateJobs()]);
      },
    }),
  );

  return (
    <PageLayout
      actions={
        quote ? (
          <div className="flex items-center gap-2">
            <QuoteCancellationAction
              canCancel={canCancelQuote}
              isPending={cancelMutation.isPending}
              job={quote.job}
              kind={quote.kind}
              onConfirm={(cancellationReason) => cancelMutation.mutate({ cancellationReason, id: quote.id })}
              status={quote.status}
            />
            <QuoteStatusBadge size="lg" status={quote.status} />
          </div>
        ) : undefined
      }
      description={quote ? getQuoteOfferingName(quote) : 'Edit Quote'}
      size="lg"
      title={quote?.code ?? 'Loading quote...'}
    >
      <ErrorMessage error={quoteQuery.error} fallbackMessage="Unable to load quote." />
      {quoteQuery.isPending ? <QuoteFormSkeleton /> : null}
      {quote ? (
        <QuoteForm
          key={quote.id}
          onSave={(value) => updateMutation.mutateAsync(value)}
          priorityQuote={priorityQuote}
          quote={quote}
        />
      ) : null}
    </PageLayout>
  );
};

function QuoteFormSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
