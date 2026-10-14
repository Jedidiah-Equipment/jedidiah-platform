import { hasPermission } from '@pkg/domain';
import { StockOnHandSortBy } from '@pkg/schema/equipment';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { inventoryPageDescription } from '@/equipment/utils/page-descriptions.js';
import { useAccess } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { StockMovementActions } from './components/StockMovementActions.js';
import { StockOnHandTable } from './components/StockOnHandTable.js';

const useInventoryTableStore = createPersistedDataTableStore({
  initialState: { sorting: [{ id: 'part', desc: false }] },
  persistName: 'inventory-table',
});
const sortOptions = { allowedSortIds: StockOnHandSortBy.options, defaultSort: { id: 'part' as const } };
const quantitySortOptions = {
  ...sortOptions,
  allowedSortIds: StockOnHandSortBy.options.filter((id) => id !== 'averageUnitCost' && id !== 'totalValue'),
};
const getListInputExtras = () => ({});

export function InventoryPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const accessQuery = useAccess();
  const showCosts = hasPermission(accessQuery.data, 'equipment_inventory_cost:read');
  const canAdjust = hasPermission(accessQuery.data, 'equipment_inventory:adjust');
  const canBuild = hasPermission(accessQuery.data, 'equipment_inventory:build');
  const canMove = hasPermission(accessQuery.data, 'equipment_inventory:move');
  const canRevalue = hasPermission(accessQuery.data, 'equipment_inventory_cost:revalue');
  const controller = useServerSideTableController({
    store: useInventoryTableStore,
    sortOptions: showCosts ? sortOptions : quantitySortOptions,
    getListInputExtras,
  });
  const stockOnHandQuery = useInfiniteQuery(
    trpc.inventory.stockOnHand.infiniteQueryOptions(controller.listInput, cursorInfiniteQueryOptions),
  );
  const { items, total } = useCombinedCursorQueryPages(stockOnHandQuery.data?.pages);

  return (
    <PageLayout
      actions={
        <StockMovementActions
          canAdjust={canAdjust}
          canBuild={canBuild}
          canMove={canMove}
          canReadCost={showCosts}
          canRevalue={canRevalue}
        />
      }
      description={inventoryPageDescription}
      title="Stock on hand"
    >
      <StockOnHandTable
        errorMessage={getApiQueryErrorMessage(stockOnHandQuery.error, 'Unable to load stock on hand.')}
        isLoading={stockOnHandQuery.isPending}
        items={items}
        controller={controller}
        pagination={{
          total,
          hasNextPage: stockOnHandQuery.hasNextPage,
          isFetchingNextPage: stockOnHandQuery.isFetchingNextPage,
          onLoadMore: () => void stockOnHandQuery.fetchNextPage(),
        }}
        onOpenHistory={(partId) => navigate({ params: { partId }, to: '/equipment/inventory/$partId' })}
        showCosts={showCosts}
      />
    </PageLayout>
  );
}
