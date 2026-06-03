import type { UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type React from 'react';

import { BackButton } from '@/components/button/BackButton.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { EditPageLayout } from '@/components/page-layout/EditPageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { QuoteForm } from './components/QuoteForm.js';
import { QuoteStatusBadge } from './components/QuoteStatusBadge.js';

type QuoteEditPageProps = {
  quoteId: UUID;
};

export const QuoteEditPage: React.FC<QuoteEditPageProps> = ({ quoteId }) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const quoteQuery = useQuery(trpc.quotes.get.queryOptions({ id: quoteId }));
  const quote = quoteQuery.data;
  const updateMutation = useMutation(
    trpc.quotes.update.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() }),
          queryClient.invalidateQueries(trpc.quotes.get.queryFilter({ id: quoteId })),
        ]);
      },
    }),
  );

  return (
    <EditPageLayout
      back={<BackButton to="/quotes">Quotes</BackButton>}
      badge={quote ? <QuoteStatusBadge size="lg" status={quote.status} /> : undefined}
      contentClassName="max-w-7xl"
      description="Edit Quote"
      title={quote?.code ?? 'Loading quote...'}
    >
      <ErrorMessage error={quoteQuery.error} fallbackMessage="Unable to load quote." />
      {quoteQuery.isPending ? <QuoteFormSkeleton /> : null}
      {quote ? <QuoteForm key={quote.id} onSave={(value) => updateMutation.mutateAsync(value)} quote={quote} /> : null}
    </EditPageLayout>
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
