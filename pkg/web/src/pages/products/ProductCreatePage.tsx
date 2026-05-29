import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { toast } from 'sonner';

import { BackButton } from '@/components/button/BackButton.js';
import { EditPageLayout } from '@/components/page-layout/EditPageLayout.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { ProductForm } from './components/ProductForm.js';

export const ProductCreatePage: React.FC = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const showMutationError = useApiMutationErrorToast();

  const createProductMutation = useMutation(
    trpc.products.create.mutationOptions({
      onSuccess: async (product) => {
        await queryClient.invalidateQueries(trpc.products.list.queryFilter());
        toast.success('Product created');
        await navigate({ to: '/products/$id/edit', params: { id: product.id } });
      },
      onError: (error) => {
        showMutationError(error, 'Unable to create product.');
      },
    }),
  );

  return (
    <EditPageLayout
      back={<BackButton to="/products">Products</BackButton>}
      description="New Product"
      title="Create a new product"
    >
      <ProductForm
        isPending={createProductMutation.isPending}
        onSubmit={(value) =>
          createProductMutation.mutateAsync({
            assemblies: value.assemblies,
            basePrice: value.basePrice,
            currencyCode: value.currencyCode,
            description: value.description,
            buildTimeDays: value.buildTimeDays,
            modelCode: value.modelCode,
            name: value.name,
            thumbnailDataUrl: value.thumbnailDataUrl,
          })
        }
        submitLabel="Create product"
      />
    </EditPageLayout>
  );
};
