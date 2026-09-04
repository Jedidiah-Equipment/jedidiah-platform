import { getQuoteOfferingName } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import type { PriorityQuote } from '@pkg/schema/equipment';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { QuoteForm } from './components/form/QuoteForm.js';
import { QuoteCancellationAction } from './components/QuoteCancellationAction.js';
import { QuoteStatusBadge } from './components/QuoteStatusBadge.js';

type QuoteEditPageProps = {
  quoteId: UUID;
};

export const QuoteEditPage: React.FC<QuoteEditPageProps> = ({ quoteId }) => {
  const trpc = useTRPC();
  const canCancelQuote = useCan('equipment_quote:cancel').can;
  const { invalidateQuotes } = useQueryInvalidation();
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

  return (
    <PageLayout
      actions={
        quote ? (
          <div className="flex items-center gap-2">
            <QuoteCancellationAction canCancel={canCancelQuote} quote={quote} />
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
