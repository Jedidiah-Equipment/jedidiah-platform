import { hasPermission } from '@pkg/domain';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { useAccess } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { inventoryPageDescription } from '@/utils/page-descriptions.js';
import { StockMovementActions } from './components/StockMovementActions.js';
import { StockOnHandTable } from './components/StockOnHandTable.js';

export function InventoryPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const accessQuery = useAccess();
  const stockOnHandQuery = useQuery(trpc.inventory.stockOnHand.queryOptions());
  const showCosts = hasPermission(accessQuery.data, 'inventory_cost:read');
  const canAdjust = hasPermission(accessQuery.data, 'inventory:adjust');
  const canBuild = hasPermission(accessQuery.data, 'inventory:build');
  const canMove = hasPermission(accessQuery.data, 'inventory:move');
  const canRevalue = hasPermission(accessQuery.data, 'inventory_cost:revalue');

  return (
    <PageLayout
      actions={
        <StockMovementActions
          canAdjust={canAdjust}
          canBuild={canBuild}
          canMove={canMove}
          canReadCost={showCosts}
          canRevalue={canRevalue}
          items={stockOnHandQuery.data?.items ?? []}
        />
      }
      description={inventoryPageDescription}
      title="Stock on hand"
    >
      <StockOnHandTable
        errorMessage={getApiQueryErrorMessage(stockOnHandQuery.error, 'Unable to load stock on hand.')}
        isLoading={stockOnHandQuery.isPending}
        items={stockOnHandQuery.data?.items ?? []}
        onOpenHistory={(partId) => navigate({ params: { partId }, to: '/equipment/inventory/$partId' })}
        showCosts={showCosts}
      />
    </PageLayout>
  );
}
