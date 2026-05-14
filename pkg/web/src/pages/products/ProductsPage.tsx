import { useNavigate } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import type React from 'react';

import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
import { useCan } from '@/hooks/use-access.js';
import { ProductTable } from './components/ProductTable.js';

export const ProductsPage: React.FC = () => {
  const navigate = useNavigate();
  const canCreateProduct = useCan('product:create').can;
  const canUpdateProduct = useCan('product:update').can;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <CardDescription>Catalog</CardDescription>
              <CardTitle>Products</CardTitle>
            </div>
            {canCreateProduct ? (
              <Button onClick={() => navigate({ to: '/products/new' })}>
                <PlusIcon data-icon="inline-start" />
                New product
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Separator />
          <ProductTable
            onEditProduct={
              canUpdateProduct
                ? (product) => navigate({ to: '/products/$id/edit', params: { id: product.id } })
                : undefined
            }
            showEditActions={canUpdateProduct}
          />
        </CardContent>
      </Card>
    </div>
  );
};
