import type { QuoteCreateInput, UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import type React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { QuoteForm } from './components/QuoteForm.js';

type QuoteFormPageProps = {
  quoteId?: UUID;
};

export const QuoteFormPage: React.FC<QuoteFormPageProps> = ({ quoteId }) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
      onError: (error) => toast.error(error.message),
    }),
  );
  const updateMutation = useMutation(
    trpc.quotes.update.mutationOptions({
      onSuccess: async (updated) => {
        await queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() });
        toast.success('Quote updated');
        await navigate({ params: { id: updated.id }, to: '/quotes/$id' });
      },
      onError: (error) => toast.error(error.message),
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
          <CardTitle>{isEditing ? 'Edit quote' : 'New quote'}</CardTitle>
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />
          {quoteQuery.error ? <p className="mb-4 text-sm text-destructive">{quoteQuery.error.message}</p> : null}
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
