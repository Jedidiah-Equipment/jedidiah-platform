import { hasPermission } from '@pkg/domain';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
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
  const canMove = hasPermission(accessQuery.data, 'inventory:move');
  const canRevalue = hasPermission(accessQuery.data, 'inventory_cost:revalue');

  return (
    <PageLayout
      actions={
        <StockMovementActions
          canAdjust={canAdjust}
          canMove={canMove}
          canReadCost={showCosts}
          canRevalue={canRevalue}
          items={stockOnHandQuery.data?.items ?? []}
        />
      }
      description={inventoryPageDescription}
      size="lg"
      title="Stock on hand"
    >
      {stockOnHandQuery.isPending ? <InventorySkeleton /> : null}
      {stockOnHandQuery.error ? <p className="text-destructive text-sm">Unable to load stock on hand.</p> : null}
      {stockOnHandQuery.data?.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No Parts are available for inventory reporting.</p>
      ) : null}
      {stockOnHandQuery.data?.items.length ? (
        <StockOnHandTable
          items={stockOnHandQuery.data.items}
          onOpenHistory={(partId) => navigate({ params: { partId }, to: '/inventory/$partId' })}
          showCosts={showCosts}
        />
      ) : null}
    </PageLayout>
  );
}

function InventorySkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
