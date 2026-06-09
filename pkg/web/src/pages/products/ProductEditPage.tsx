import type { Product, UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo } from 'react';
import { AuditTable, useProductAuditTableStore } from '@/components/audit/AuditTable.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useCan } from '@/hooks/use-access.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { ProductAssembliesTabTrigger } from './components/ProductAssembliesTabTrigger.js';
import { ProductBaysTabTrigger } from './components/ProductBaysTabTrigger.js';
import { ProductDocumentsSection } from './components/ProductDocumentsSection.js';
import { ProductDocumentsTabTrigger } from './components/ProductDocumentsTabTrigger.js';
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
    <PageLayout description="Edit Product" size="md" title={productQuery.data?.name ?? 'Loading product...'}>
      {productQuery.isPending ? <ProductFormSkeleton /> : null}
      <ErrorMessage error={productQuery.error} fallbackMessage="Unable to load product." />
      {productQuery.data ? (
        <ProductEditTabs
          onProductSave={(value) => updateProductMutation.mutateAsync(value)}
          product={productQuery.data}
        />
      ) : null}
    </PageLayout>
  );
};

type ProductEditTabsProps = {
  onProductSave: React.ComponentProps<typeof ProductForm>['onSave'];
  product: Product;
};

const ProductEditTabs: React.FC<ProductEditTabsProps> = ({ onProductSave, product }) => {
  const auditAccess = useCan('audit:read');
  const productAuditFilters = useMemo(
    () => ({
      entityIds: [product.id],
      entityTypes: ['product' as const],
    }),
    [product.id],
  );

  return (
    <Tabs className="w-full" defaultValue="details" size="sm">
      <TabsList variant="default">
        <TabsTrigger value="details">Details</TabsTrigger>
        <ProductBaysTabTrigger productId={product.id} />
        <ProductAssembliesTabTrigger productId={product.id} />
        <ProductDocumentsTabTrigger productId={product.id} />
        {auditAccess.can ? <TabsTrigger value="audit">Audit</TabsTrigger> : null}
      </TabsList>
      <ProductForm key={product.id} onSave={onProductSave} product={product} />
      <TabsContent className="pt-4" value="documents">
        <ProductDocumentsSection productId={product.id} />
      </TabsContent>
      {auditAccess.can ? (
        <TabsContent className="pt-4" value="audit">
          <AuditTable
            emptyMessage="No audit events found for this product."
            fixedFilters={productAuditFilters}
            showEntityTypeFilter={false}
            store={useProductAuditTableStore}
          />
        </TabsContent>
      ) : null}
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
