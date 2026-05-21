import type { UUID } from '@pkg/schema';
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
import { ProductForm } from './components/ProductForm.js';

type ProductEditPageProps = {
  productId: UUID;
};

export const ProductEditPage: React.FC<ProductEditPageProps> = ({ productId }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();
  const productQuery = useQuery(trpc.products.get.queryOptions({ id: productId }));
  const updateProductMutation = useMutation(
    trpc.products.update.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.products.list.queryFilter()),
          queryClient.invalidateQueries(trpc.products.get.queryFilter({ id: productId })),
        ]);
        toast.success('Product updated');
        await navigate({ to: '/products' });
      },
      onError: (error) => {
        showMutationError(error, 'Unable to update product.');
      },
    }),
  );

  return (
    <EditPageLayout back={<BackButton to="/products">Products</BackButton>} description="Catalog" title="Edit product">
      {productQuery.isPending ? <ProductFormSkeleton /> : null}
      <ErrorMessage error={productQuery.error} fallbackMessage="Unable to load product." />
      {productQuery.data ? (
        <ProductForm
          initialProduct={productQuery.data}
          isPending={updateProductMutation.isPending}
          key={productQuery.data.id}
          onSubmit={(value) =>
            updateProductMutation.mutateAsync({
              basePrice: value.basePrice,
              currencyCode: 'ZAR',
              departmentConfigs: value.departmentConfigs,
              description: value.description,
              id: productQuery.data.id,
              modelCode: value.modelCode,
              name: value.name,
              options: value.options,
            })
          }
          submitLabel="Save product"
        />
      ) : null}
    </EditPageLayout>
  );
};

function ProductFormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
