import type { UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
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
        <ProductRangeForm
          canEdit={canEdit}
          key={rangeQuery.data.id}
          onSave={(value) => updateMutation.mutateAsync(value)}
          range={rangeQuery.data}
        />
      ) : null}
    </PageLayout>
  );
};
