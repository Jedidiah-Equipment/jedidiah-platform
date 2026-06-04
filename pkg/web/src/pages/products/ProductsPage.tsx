import { IconPlus } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';

import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useCan } from '@/hooks/use-access.js';
import { ProductTable } from './components/ProductTable.js';
import { ProductCreateDialog } from './ProductCreateDialog.js';

export const ProductsPage: React.FC = () => {
  const navigate = useNavigate();
  const canCreateProduct = useCan('product:create').can;
  const canUpdateProduct = useCan('product:update').can;
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <>
      <ListPageLayout
        action={
          canCreateProduct ? (
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <IconPlus data-icon="inline-start" />
              New product
            </Button>
          ) : null
        }
        description="Catalog"
        title="Products"
      >
        <ProductTable
          onEditProduct={
            canUpdateProduct
              ? (product) => navigate({ to: '/products/$id/edit', params: { id: product.id } })
              : undefined
          }
        />
      </ListPageLayout>
      {canCreateProduct ? <ProductCreateDialog onOpenChange={setIsCreateDialogOpen} open={isCreateDialogOpen} /> : null}
    </>
  );
};
