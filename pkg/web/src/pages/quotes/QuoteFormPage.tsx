import type { QuoteCreateInput, UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import type React from 'react';
import { toast } from 'sonner';

import { ErrorMessage } from '@/components/ErrorMessage.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
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
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div>
        {quoteId ? (
          <Button render={<Link params={{ id: quoteId }} to="/quotes/$id" />} variant="ghost">
            <ArrowLeftIcon data-icon="inline-start" />
            Quote
          </Button>
        ) : (
          <Button render={<Link to="/quotes" />} variant="ghost">
            <ArrowLeftIcon data-icon="inline-start" />
            Quotes
          </Button>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardDescription>Sales</CardDescription>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{isEditing ? 'Edit quote' : 'New quote'}</CardTitle>
            {quote ? <QuoteStatusBadge status={quote.status} /> : null}
          </div>
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />
          <ErrorMessage className="mb-4" error={quoteQuery.error} fallbackMessage="Unable to load quote." />
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
        </CardContent>
      </Card>
    </div>
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
