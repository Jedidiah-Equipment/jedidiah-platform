import { IconDownload, IconLoader2, IconPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { productsPageDescription } from '@/utils/page-descriptions.js';
import { ProductTable } from './components/ProductTable.js';
import { ProductCreateDialog } from './ProductCreateDialog.js';
import { downloadProductAssemblyExport } from './product-assembly-export.js';

export const ProductsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();
  const canCreateProduct = useCan('product:create').can;
  const canUpdateProduct = useCan('product:update').can;
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const exportMutation = useMutation({
    mutationFn: () => queryClient.fetchQuery(trpc.products.assemblyExport.queryOptions()),
    onError: (error) => showMutationError(error, 'Unable to export product assemblies.'),
    onSuccess: (rows) => downloadProductAssemblyExport(rows),
  });

  return (
    <>
      <PageLayout
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()} variant="outline">
              {exportMutation.isPending ? (
                <IconLoader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <IconDownload data-icon="inline-start" />
              )}
              Export CSV
            </Button>
            {canCreateProduct ? (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <IconPlus data-icon="inline-start" />
                New product
              </Button>
            ) : null}
          </div>
        }
        description={productsPageDescription}
        size="lg"
        title="Products"
      >
        <ProductTable
          onEditProduct={
            canUpdateProduct
              ? (product) => navigate({ to: '/products/$id/edit', params: { id: product.id } })
              : undefined
          }
        />
      </PageLayout>
      {canCreateProduct ? <ProductCreateDialog onOpenChange={setIsCreateDialogOpen} open={isCreateDialogOpen} /> : null}
    </>
  );
};
