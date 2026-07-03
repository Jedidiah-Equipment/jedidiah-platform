import type { PriorityQuote, UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { QuoteForm } from './components/form/QuoteForm.js';
import { QuoteStatusBadge } from './components/QuoteStatusBadge.js';

type QuoteEditPageProps = {
  quoteId: UUID;
};

export const QuoteEditPage: React.FC<QuoteEditPageProps> = ({ quoteId }) => {
  const trpc = useTRPC();
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
      actions={quote ? <QuoteStatusBadge size="lg" status={quote.status} /> : undefined}
      description={quote?.kind === 'custom' ? (quote.workTitle ?? 'Custom Quote') : 'Edit Quote'}
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
