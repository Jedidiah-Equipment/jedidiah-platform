import type { UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Loader2Icon } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { BackButton } from '@/components/button/BackButton.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { ReadOnlyField } from '@/components/form/ReadOnlyField.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { QuoteProductCombobox } from '@/pages/quotes/components/QuoteProductCombobox.js';

type JobCreatePageProps = {
  quoteId: UUID | undefined;
};

export const JobCreatePage: React.FC<JobCreatePageProps> = ({ quoteId }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const showMutationError = useApiMutationErrorToast();
  const [productId, setProductId] = useState<UUID | ''>('');

  const quoteQuery = useQuery({
    ...trpc.quotes.get.queryOptions({ id: quoteId ?? '' }),
    enabled: Boolean(quoteId),
  });
  const quote = quoteQuery.data ?? null;
  const productQuery = useQuery({
    ...trpc.products.get.queryOptions({ id: productId as UUID }),
    enabled: Boolean(productId),
  });
  const selectedProduct = productQuery.data ?? null;

  const createJobMutation = useMutation(
    trpc.jobs.create.mutationOptions({
      onSuccess: async (job) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.jobs.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() }),
        ]);
        toast.success('Job created');
        await navigate({ params: { id: job.id }, to: '/jobs/$id' });
      },
      onError: (error) => showMutationError(error, 'Unable to create job.'),
    }),
  );

  useEffect(() => {
    if (!quote) return;

    setProductId(quote.productId ?? '');
  }, [quote]);

  const canSubmit = Boolean(selectedProduct) && !createJobMutation.isPending;
  const title = quote ? `Create job from ${quote.code}` : 'Create job';
  const backTarget = quote ? <BackButton to="/quotes">Quotes</BackButton> : <BackButton to="/jobs">Jobs</BackButton>;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
      <div>{backTarget}</div>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <Separator />
          <ErrorMessage error={quoteQuery.error} fallbackMessage="Unable to load quote." />
          {quoteId && quoteQuery.isPending ? <CreateJobPageSkeleton /> : null}
          {!quoteId || quote ? (
            <div
              className={
                quote
                  ? 'grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(14rem,1fr)]'
                  : 'grid min-w-0 gap-3 md:grid-cols-[minmax(14rem,1fr)]'
              }
            >
              {quote ? (
                <>
                  <ReadOnlyField label="Quote Code" value={quote.code} />
                  <ReadOnlyField label="Customer Name" value={quote.customerCompanyName} />
                </>
              ) : null}
              <FieldBlock label="Product">
                <QuoteProductCombobox
                  disabled={createJobMutation.isPending}
                  notifyResolvedSelection={false}
                  onSelected={(product) => {
                    const nextProductId = product?.id ?? '';
                    setProductId((currentProductId) =>
                      currentProductId === nextProductId ? currentProductId : nextProductId,
                    );
                  }}
                  value={productId}
                />
              </FieldBlock>
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end gap-2 border-t">
          <Button
            disabled={createJobMutation.isPending}
            onClick={() => {
              if (quote) {
                return void navigate({ to: '/quotes' });
              }

              return void navigate({ to: '/jobs' });
            }}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              createJobMutation.mutate({
                productId: productId as UUID,
                quoteId: quote?.id ?? null,
              })
            }
            type="button"
          >
            {createJobMutation.isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
            Create job
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

const FieldBlock: React.FC<{ children: React.ReactNode; label: string }> = ({ children, label }) => (
  <div className="grid gap-1.5 text-sm font-medium">
    <span>{label}</span>
    {children}
  </div>
);

function CreateJobPageSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
