import type { ProductRange, UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { toast } from 'sonner';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { ProductRangeForm } from './components/ProductRangeForm.js';

type ProductRangeEditPageProps = {
  rangeId: UUID;
};

export const ProductRangeEditPage: React.FC<ProductRangeEditPageProps> = ({ rangeId }) => {
  const trpc = useTRPC();
  const canEdit = useCan('product_range:update').can;
  const { invalidateProductRanges } = useQueryInvalidation();
  const rangeQuery = useQuery(trpc.productRanges.get.queryOptions({ id: rangeId }));
  const updateMutation = useMutation(
    trpc.productRanges.update.mutationOptions({
      onSuccess: async () => {
        await invalidateProductRanges();
      },
    }),
  );

  return (
    <PageLayout description="Edit Product Range" size="md" title={rangeQuery.data?.name ?? 'Loading range...'}>
      {rangeQuery.isPending ? <Skeleton className="h-10 w-full" /> : null}
      <ErrorMessage error={rangeQuery.error} fallbackMessage="Unable to load Product Range." />
      {rangeQuery.data ? (
        <>
          <ProductRangeForm
            canEdit={canEdit}
            key={rangeQuery.data.id}
            onSave={(value) => updateMutation.mutateAsync(value)}
            range={rangeQuery.data}
          />
          {canEdit ? (
            <div className="mt-8 flex justify-end border-t pt-4">
              <RemoveProductRangeButton range={rangeQuery.data} />
            </div>
          ) : null}
        </>
      ) : null}
    </PageLayout>
  );
};

const RemoveProductRangeButton: React.FC<{ range: ProductRange }> = ({ range }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateProductRanges, invalidateProducts, invalidateQuotes } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();

  const removeMutation = useMutation(
    trpc.productRanges.remove.mutationOptions({
      onSuccess: async () => {
        await Promise.all([invalidateProductRanges(), invalidateProducts(), invalidateQuotes()]);
        toast.success('Product Range removed');
        await navigate({ to: '/product-ranges' });
      },
      onError: (error) => {
        showMutationError(error, 'Unable to remove Product Range.');
      },
    }),
  );

  return (
    <RemoveEntityButton
      description={
        <>Remove {range.name} from active Product Ranges. Historical product references will keep their Range.</>
      }
      isPending={removeMutation.isPending}
      onConfirm={() => removeMutation.mutate({ id: range.id })}
      title="Remove Product Range"
      triggerLabel="Remove range"
    />
  );
};
