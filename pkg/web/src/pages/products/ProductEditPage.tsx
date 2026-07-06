import type { Product, UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AuditTable, useProductAuditTableStore } from '@/components/audit/AuditTable.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { ProductAssembliesTabTrigger } from './components/ProductAssembliesTabTrigger.js';
import { ProductBaysTabTrigger } from './components/ProductBaysTabTrigger.js';
import { ProductDocumentsSection } from './components/ProductDocumentsSection.js';
import { ProductDocumentsTabTrigger } from './components/ProductDocumentsTabTrigger.js';
import { ProductForm } from './components/ProductForm.js';
import { ProductImagesSection } from './components/ProductImagesSection.js';
import { isProductFullyReady, ProductReadinessAside, type ProductTab } from './components/ProductReadinessAside.js';

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

  // Widen the page while the readiness aside is showing so the form keeps its breathing room beside the
  // 22rem aside column; once the Product is fully ready (no aside) it returns to the standard width.
  const showAside = productQuery.data ? !isProductFullyReady(productQuery.data) : false;

  return (
    <PageLayout
      description="Edit Product"
      size={showAside ? 'lg' : 'md'}
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
    </PageLayout>
  );
};

type ProductEditTabsProps = {
  onProductSave: React.ComponentProps<typeof ProductForm>['onSave'];
  product: Product;
};

const ProductEditTabs: React.FC<ProductEditTabsProps> = ({ onProductSave, product }) => {
  const auditAccess = useCan('audit:read');
  const canRemoveProduct = useCan('product:update').can;
  const productAuditFilters = useMemo(
    () => ({
      entityIds: [product.id],
      entityTypes: ['product' as const],
    }),
    [product.id],
  );

  // Tabs are controlled so the readiness aside can jump to the tab that owns a missing field. The aside
  // stays mounted (and reserves its grid column) until the Product is fully ready, then the tabs reclaim the
  // full width.
  const [tab, setTab] = useState<ProductTab>('details');
  const showAside = !isProductFullyReady(product);

  return (
    <div className={cn('grid gap-4', showAside && 'xl:grid-cols-[minmax(0,1fr)_22rem]')}>
      <Tabs className="w-full" onValueChange={(value) => setTab(value as ProductTab)} size="sm" value={tab}>
        <TabsList variant="default">
          <TabsTrigger value="details">Details</TabsTrigger>
          <ProductBaysTabTrigger productId={product.id} />
          <ProductAssembliesTabTrigger productId={product.id} />
          <TabsTrigger value="images">Images</TabsTrigger>
          <ProductDocumentsTabTrigger productId={product.id} />
          {auditAccess.can ? <TabsTrigger value="audit">Audit</TabsTrigger> : null}
        </TabsList>
        <ProductForm
          detailsFooter={
            canRemoveProduct ? (
              <div className="mt-4 flex justify-end border-t pt-4">
                <RemoveProductButton product={product} />
              </div>
            ) : null
          }
          key={product.id}
          onSave={onProductSave}
          product={product}
        />
        <TabsContent className="pt-4" value="images">
          <ProductImagesSection product={product} />
        </TabsContent>
        <TabsContent className="pt-4" value="documents">
          <ProductDocumentsSection product={product} />
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
      {showAside ? (
        <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <ProductReadinessAside onNavigate={setTab} product={product} />
        </aside>
      ) : null}
    </div>
  );
};

const RemoveProductButton: React.FC<{ product: Product }> = ({ product }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateProducts, invalidateQuotes } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();

  const removeProductMutation = useMutation(
    trpc.products.remove.mutationOptions({
      onSuccess: async () => {
        await Promise.all([invalidateProducts(), invalidateQuotes()]);
        toast.success('Product removed');
        await navigate({ to: '/products' });
      },
      onError: (error) => {
        showMutationError(error, 'Unable to remove Product.');
      },
    }),
  );

  return (
    <RemoveEntityButton
      description={
        <>Remove {product.name} from active Products. Historical quotes and jobs will keep their Product details.</>
      }
      isPending={removeProductMutation.isPending}
      onConfirm={() => removeProductMutation.mutate({ id: product.id })}
      title="Remove Product"
      triggerLabel="Remove product"
    />
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
