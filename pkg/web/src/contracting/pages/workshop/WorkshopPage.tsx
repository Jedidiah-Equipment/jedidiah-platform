import { formatNumber } from '@pkg/domain';
import type { BreakdownListInput } from '@pkg/schema/contracting';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useDataTable } from '@/components/data-table/features.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { BreakdownStatusQuickFilters } from './BreakdownStatusQuickFilters.js';
import { workshopListFilters } from './types.js';
import { useWorkshopColumns } from './workshop-columns.js';

const useWorkshopTableStore = createPersistedDataTableStore({
  initialState: { sorting: [{ id: 'reportedAt', desc: true }] },
  persistName: 'contracting-workshop-table',
});

const breakdownSortOptions: SortOptions<BreakdownListInput> = {
  allowedSortIds: ['reportedAt', 'urgency'],
  defaultSort: { id: 'reportedAt', desc: true },
};

export function WorkshopPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const write = useContractingWrite(useQueryInvalidation().invalidateWorkshop);
  const canManage = useCan('contracting_breakdown:update').can;
  const summary = useQuery(trpc.contractingBreakdowns.queueSummary.queryOptions());
  const tableController = useServerSideTableController({
    store: useWorkshopTableStore,
    sortOptions: breakdownSortOptions,
    getListInputExtras: workshopListFilters,
  });
  const breakdownsQuery = useInfiniteQuery(
    trpc.contractingBreakdowns.list.infiniteQueryOptions(tableController.listInput, {
      ...cursorInfiniteQueryOptions,
      placeholderData: keepPreviousData,
    }),
  );
  const { items: breakdowns, total } = useCombinedCursorQueryPages(breakdownsQuery.data?.pages);
  const mechanics = useQuery(
    trpc.contractingBreakdowns.options.mechanics.queryOptions(undefined, { enabled: canManage }),
  );
  const filters = useQuery(trpc.contractingBreakdowns.options.filters.queryOptions());
  const assign = useMutation(
    trpc.contractingBreakdowns.assignMechanic.mutationOptions(write.card('Unable to assign the Mechanic.')),
  );
  const columns = useWorkshopColumns({
    canManage,
    filters: filters.data,
    mechanics: mechanics.data,
    onAssignMechanic: assign.mutate,
  });
  const table = useDataTable({
    columns,
    data: breakdowns,
    enableSortingRemoval: false,
    manualFiltering: true,
    manualSorting: true,
    onColumnFiltersChange: tableController.setColumnFilters,
    onGlobalFilterChange: tableController.setGlobalFilter,
    onSortingChange: tableController.setSorting,
    state: {
      columnFilters: tableController.columnFilters,
      globalFilter: tableController.globalFilter,
      sorting: tableController.sorting,
    },
  });
  return (
    <PageLayout
      title="Workshop"
      description="Breakdowns reported from the field, newest first. One trip can fix several."
      size="full"
    >
      <ErrorMessage
        error={summary.error ?? filters.error ?? mechanics.error}
        fallbackMessage="Unable to load the Workshop."
      />
      <BreakdownStatusQuickFilters
        summary={summary.data}
        columnFilters={tableController.columnFilters}
        onColumnFiltersChange={tableController.setColumnFilters}
      />
      <DataTable
        emptyMessage="No Breakdowns found."
        errorMessage={getApiQueryErrorMessage(breakdownsQuery.error, 'Unable to load Breakdowns.')}
        getRowAriaLabel={(breakdown) => `Open the Breakdown on ${breakdown.subject.code}`}
        globalFilterPlaceholder="Search Breakdowns…"
        isLoading={breakdownsQuery.isPending}
        paginationMode="cursor"
        loadMore={{
          hasNextPage: breakdownsQuery.hasNextPage,
          isFetchingNextPage: breakdownsQuery.isFetchingNextPage,
          loadedCount: breakdowns.length,
          onLoadMore: () => void breakdownsQuery.fetchNextPage(),
        }}
        onRowClick={(breakdown) => void navigate({ to: '/contracting/workshop/$id', params: { id: breakdown.id } })}
        table={table}
        total={total}
        totalLabel={(value) => `${formatNumber(value)} ${value === 1 ? 'Breakdown' : 'Breakdowns'}`}
      />
    </PageLayout>
  );
}
