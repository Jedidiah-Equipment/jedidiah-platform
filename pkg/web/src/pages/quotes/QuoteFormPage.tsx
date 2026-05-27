import type { QuoteCreateInput, UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { toast } from 'sonner';

import { BackButton } from '@/components/button/BackButton.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { EditPageLayout } from '@/components/page-layout/EditPageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { QuoteForm } from './components/QuoteForm.js';
import { QuoteStatusBadge } from './components/QuoteStatusBadge.js';

type QuoteFormPageProps = {
  quoteId?: UUID;
};

export const QuoteFormPage: React.FC<QuoteFormPageProps> = ({ quoteId }) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const showMutationError = useApiMutationErrorToast();
  const isEditing = Boolean(quoteId);
  const quoteQuery = useQuery({
    ...trpc.quotes.get.queryOptions({ id: quoteId ?? '' }),
    enabled: Boolean(quoteId),
  });
  const quote = quoteQuery.data;
  const createMutation = useMutation(
    trpc.quotes.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() });
        toast.success('Quote created');
        await navigate({ params: { id: created.id }, to: '/quotes/$id' });
      },
      onError: (error) => showMutationError(error, 'Unable to create quote.'),
    }),
  );
  const updateMutation = useMutation(
    trpc.quotes.update.mutationOptions({
      onSuccess: async (updated) => {
        await queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() });
        toast.success('Quote updated');
        await navigate({ params: { id: updated.id }, to: '/quotes/$id' });
      },
      onError: (error) => showMutationError(error, 'Unable to update quote.'),
    }),
  );
  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (value: QuoteCreateInput) => {
    if (!isEditing) {
      return createMutation.mutateAsync(value);
    }

    if (!quoteId || value.customer.type !== 'existing') {
      throw new Error('Edited quotes must use an existing customer.');
    }

    return updateMutation.mutateAsync({
      ...value,
      customer: value.customer,
      id: quoteId,
    });
  };

  return (
    <EditPageLayout
      back={
        quoteId ? (
          <BackButton params={{ id: quoteId }} to="/quotes/$id">
            Quote
          </BackButton>
        ) : (
          <BackButton to="/quotes">Quotes</BackButton>
        )
      }
      badge={quote ? <QuoteStatusBadge status={quote.status} /> : undefined}
      description={isEditing ? 'Edit Quote' : 'New Quote'}
      title={isEditing ? (quote?.code ?? 'Loading quote...') : 'Create a new quote'}
    >
      <ErrorMessage error={quoteQuery.error} fallbackMessage="Unable to load quote." />
      {isEditing && quoteQuery.isPending ? <QuoteFormSkeleton /> : null}
      {!isEditing || quote ? (
        <QuoteForm
          initialQuote={quote}
          isPending={isPending}
          key={quote?.id ?? 'new'}
          onSubmit={onSubmit}
          submitLabel={isEditing ? 'Save quote' : 'Create quote'}
        />
      ) : null}
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
