import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import type React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { ProductForm } from './components/ProductForm.js';

export const ProductCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();
  const createProductMutation = useMutation(
    trpc.products.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.products.list.queryFilter());
        toast.success('Product created');
        await navigate({ to: '/products' });
      },
      onError: (error) => {
        showMutationError(error, 'Unable to create product.');
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
          <CardTitle>New product</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm
            isPending={createProductMutation.isPending}
            onSubmit={(value) =>
              createProductMutation.mutateAsync({
                basePrice: value.basePrice,
                currencyCode: 'ZAR',
                description: value.description,
                modelCode: value.modelCode,
                name: value.name,
                options: value.options,
              })
            }
            submitLabel="Create product"
          />
        </CardContent>
      </Card>
    </div>
  );
};
