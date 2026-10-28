import { countPhrase } from '@pkg/domain';
import { breakdownStatusColorClassNames, breakdownStatusLabels } from '@pkg/domain/contracting';
import { type BreakdownListInput, breakdownStatuses } from '@pkg/schema/contracting';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useDataTable } from '@/components/data-table/features.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { StatusQuickFilters } from '@/contracting/components/StatusQuickFilters.js';
import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { ReportProblemDialog } from './ReportProblemDialog.js';
import {
  focusOnMechanic,
  focusOnUnsolved,
  quickFilterStatuses,
  STATUS_COLUMN_ID,
  workshopListFilters,
} from './types.js';
import { useWorkshopColumns } from './workshop-columns.js';

const useWorkshopTableStore = createPersistedDataTableStore({
  initialState: { sorting: [{ id: 'reportedAt', desc: true }] },
  persistName: 'contracting-workshop-table',
});

/** Writes one Mechanic's work, every status, into the saved filters; the Reports page opens the Workshop this way. */
export function focusWorkshopOnMechanic(mechanicUserId: string) {
  useWorkshopTableStore.getState().setColumnFilters((current) => focusOnMechanic(current, mechanicUserId));
}

/** Drops a saved status pick so the Breakdowns not yet Fixed list; the Dashboard opens the Workshop this way. */
export function focusWorkshopOnUnsolved() {
  useWorkshopTableStore.getState().setColumnFilters(focusOnUnsolved);
}

const useMachineWorkshopTableStore = createPersistedDataTableStore({
  initialState: { sorting: [{ id: 'reportedAt', desc: true }] },
  persistName: 'contracting-machine-workshop-table',
});

/** What differs between the whole Workshop and one Machine's: the saved table state, what the server is asked, the chrome. */
type WorkshopScope = {
  store: typeof useWorkshopTableStore;
  listFilters: (columnFilters: ColumnFiltersState) => Partial<BreakdownListInput>;
  showsQueueCounts: boolean;
  showsSubject: boolean;
};

const wholeWorkshop: WorkshopScope = {
  store: useWorkshopTableStore,
  listFilters: (columnFilters) => workshopListFilters(columnFilters),
  showsQueueCounts: true,
  showsSubject: true,
};

/** One Machine's Breakdowns, every status until one is picked: its history, Fixed ones included, and no one else's. */
const machineWorkshop = (machineId: string): WorkshopScope => ({
  store: useMachineWorkshopTableStore,
  listFilters: (columnFilters) => ({
    ...workshopListFilters(columnFilters, breakdownStatuses),
    machineIds: [machineId],
    implementIds: [],
  }),
  showsQueueCounts: false,
  showsSubject: false,
});

const breakdownSortOptions: SortOptions<BreakdownListInput> = {
  allowedSortIds: ['reportedAt', 'urgency'],
  defaultSort: { id: 'reportedAt', desc: true },
};

export function WorkshopPage() {
  const canReport = useCan('contracting_breakdown:report').can;
  const [reporting, setReporting] = useState(false);
  return (
    <PageLayout
      title="Workshop"
      description="Breakdowns reported from the field, newest first. One trip can fix several."
      size="full"
      actions={canReport ? <Button onClick={() => setReporting(true)}>Report a problem</Button> : undefined}
    >
      <WorkshopTable />
      <ReportProblemDialog open={reporting} onOpenChange={setReporting} />
    </PageLayout>
  );
}

/** The Workshop queue, or with a `machineId` that Machine's Breakdowns (see `machineWorkshop`). */
export function WorkshopTable({ machineId }: { machineId?: string } = {}) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const write = useContractingWrite(useQueryInvalidation().invalidateWorkshop);
  const canManage = useCan('contracting_breakdown:update').can;
  const scope = useMemo(() => (machineId ? machineWorkshop(machineId) : wholeWorkshop), [machineId]);
  const summary = useQuery(
    trpc.contractingBreakdowns.queueSummary.queryOptions(undefined, { enabled: scope.showsQueueCounts }),
  );
  const tableController = useServerSideTableController({
    store: scope.store,
    sortOptions: breakdownSortOptions,
    getListInputExtras: scope.listFilters,
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
    hideSubject: !scope.showsSubject,
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
    <>
      <ErrorMessage
        error={summary.error ?? filters.error ?? mechanics.error}
        fallbackMessage="Unable to load the Workshop."
      />
      {scope.showsQueueCounts ? (
        <StatusQuickFilters
          label="Breakdown statuses"
          columnId={STATUS_COLUMN_ID}
          statuses={breakdownStatuses}
          shown={quickFilterStatuses(summary.data?.counts, tableController.columnFilters)}
          labels={breakdownStatusLabels}
          colours={breakdownStatusColorClassNames}
          counts={summary.data?.counts}
          columnFilters={tableController.columnFilters}
          onColumnFiltersChange={tableController.setColumnFilters}
        />
      ) : null}
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
        totalLabel={(value) => countPhrase(value, 'Breakdown', 'Breakdowns')}
      />
    </>
  );
}
