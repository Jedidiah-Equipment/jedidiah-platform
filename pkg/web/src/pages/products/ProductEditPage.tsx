import type { UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import type React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { ProductForm } from './components/ProductForm.js';

type ProductEditPageProps = {
  productId: UUID;
};

export const ProductEditPage: React.FC<ProductEditPageProps> = ({ productId }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
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
        toast.error(error.message);
      },
    }),
  );

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div>
        <Button onClick={() => navigate({ to: '/products' })} type="button" variant="ghost">
          <ArrowLeftIcon data-icon="inline-start" />
          Products
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardDescription>Catalog</CardDescription>
          <CardTitle>Edit product</CardTitle>
        </CardHeader>
        <CardContent>
          {productQuery.isPending ? <ProductFormSkeleton /> : null}
          {productQuery.error ? <p className="text-sm text-destructive">{productQuery.error.message}</p> : null}
          {productQuery.data ? (
            <ProductForm
              initialProduct={productQuery.data}
              isPending={updateProductMutation.isPending}
              key={productQuery.data.id}
              onSubmit={(value) =>
                updateProductMutation.mutateAsync({
                  basePrice: value.basePrice,
                  currencyCode: 'ZAR',
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
        </CardContent>
      </Card>
    </div>
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
