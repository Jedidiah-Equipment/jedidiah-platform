import { useNavigate } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import type React from 'react';

import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useCan } from '@/hooks/use-access.js';
import { ProductTable } from './components/ProductTable.js';

export const ProductsPage: React.FC = () => {
  const navigate = useNavigate();
  const canCreateProduct = useCan('product:create').can;
  const canUpdateProduct = useCan('product:update').can;

  return (
    <ListPageLayout
      action={
        canCreateProduct ? (
          <Button onClick={() => navigate({ to: '/products/new' })}>
            <PlusIcon data-icon="inline-start" />
            New product
          </Button>
        ) : null
      }
      description="Catalog"
      title="Products"
    >
      <ProductTable
        onEditProduct={
          canUpdateProduct ? (product) => navigate({ to: '/products/$id/edit', params: { id: product.id } }) : undefined
        }
        showEditActions={canUpdateProduct}
      />
    </ListPageLayout>
  );
};
