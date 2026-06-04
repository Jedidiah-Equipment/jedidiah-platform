import type { Product, UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';

import { BackButton } from '@/components/button/BackButton.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { EditPageLayout } from '@/components/page-layout/EditPageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { ProductDocumentsSection } from './components/ProductDocumentsSection.js';
import { ProductForm } from './components/ProductForm.js';

type ProductEditPageProps = {
  productId: UUID;
};

export const ProductEditPage: React.FC<ProductEditPageProps> = ({ productId }) => {
  const trpc = useTRPC();
  const { invalidateProducts } = useQueryInvalidation();

  const productQuery = useQuery(trpc.products.get.queryOptions({ id: productId }));

  const updateProductMutation = useMutation(
    trpc.products.update.mutationOptions({
      onSuccess: async () => {
        await invalidateProducts();
      },
    }),
  );

  return (
    <EditPageLayout
      back={<BackButton to="/products">Products</BackButton>}
      description="Edit Product"
      title={productQuery.data?.name ?? 'Loading product...'}
    >
      {productQuery.isPending ? <ProductFormSkeleton /> : null}
      <ErrorMessage error={productQuery.error} fallbackMessage="Unable to load product." />
      {productQuery.data ? (
        <ProductEditTabs
          onProductSave={(value) => updateProductMutation.mutateAsync(value)}
          product={productQuery.data}
        />
      ) : null}
    </EditPageLayout>
  );
};

type ProductEditTabsProps = {
  onProductSave: React.ComponentProps<typeof ProductForm>['onSave'];
  product: Product;
};

const ProductEditTabs: React.FC<ProductEditTabsProps> = ({ onProductSave, product }) => {
  return (
    <Tabs className="w-full" defaultValue="details" size="sm">
      <TabsList variant="default">
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
      </TabsList>
      <TabsContent className="pt-4" value="details">
        <ProductForm key={product.id} onSave={onProductSave} product={product} />
      </TabsContent>
      <TabsContent className="pt-4" value="documents">
        <ProductDocumentsSection productId={product.id} />
      </TabsContent>
    </Tabs>
  );
};

function ProductFormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
