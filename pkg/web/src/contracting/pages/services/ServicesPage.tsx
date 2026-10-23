import { countPhrase } from '@pkg/domain';
import { serviceRecordStatusColorClassNames, serviceRecordStatusLabels } from '@pkg/domain/contracting';
import { type ServiceRecordListInput, serviceRecordStatuses } from '@pkg/schema/contracting';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useDataTable } from '@/components/data-table/features.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { PRIORITY_ROW_CLASS_NAME } from '@/components/data-table/priority-row.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { StatusQuickFilters } from '@/contracting/components/StatusQuickFilters.js';
import { useMachinesDueForService } from '@/contracting/hooks/use-machines-due-for-service.js';
import { RecordServiceDialog } from '@/contracting/pages/fleet/RecordServiceDialog.js';
import { useServiceMechanicOptions } from '@/contracting/pages/fleet/use-service-mechanic-options.js';
import { useCan } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { useServicesColumns } from './services-columns.js';
import { dueRow, recordRow, type ServicesTableRow, STATUS_COLUMN_ID, servicesTableFilters } from './types.js';

const useServicesTableStore = createPersistedDataTableStore({
  initialState: { sorting: [{ id: 'startDate', desc: true }] },
  persistName: 'contracting-services-table',
});

const serviceRecordSortOptions: SortOptions<ServiceRecordListInput> = {
  allowedSortIds: ['startDate'],
  defaultSort: { id: 'startDate', desc: true },
};

/**
 * Every Service Record, Booked In first, with the Machines Due for Service pinned above them in the priority-quote
 * pattern: their own query, so no filter, search or sort on the table can hide one.
 */
export function ServicesPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const canRecord = useCan('contracting_service:update').can;
  const [recordingMachineId, setRecordingMachineId] = useState<string | null>(null);
  const tableController = useServerSideTableController({
    store: useServicesTableStore,
    sortOptions: serviceRecordSortOptions,
    getListInputExtras: servicesTableFilters,
  });
  const recordsQuery = useInfiniteQuery(
    trpc.contractingServices.list.infiniteQueryOptions(tableController.listInput, {
      ...cursorInfiniteQueryOptions,
      placeholderData: keepPreviousData,
    }),
  );
  const dueQuery = useMachinesDueForService();
  const summary = useQuery(trpc.contractingServices.summary.queryOptions());
  const filters = useQuery(trpc.contractingServices.options.filters.queryOptions());
  const mechanics = useServiceMechanicOptions(canRecord);
  const { items: records, total } = useCombinedCursorQueryPages(recordsQuery.data?.pages);
  const rows = useMemo<ServicesTableRow[]>(
    () => [...(dueQuery.data ?? []).map(dueRow), ...records.map(recordRow)],
    [dueQuery.data, records],
  );
  const columns = useServicesColumns({
    filters: filters.data,
    onRecordService: canRecord ? setRecordingMachineId : undefined,
  });
  const table = useDataTable({
    columns,
    data: rows,
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
      title="Services"
      description="Machines due for a service first, then every Service Record. Booking one in takes it off the top."
      size="full"
    >
      <ErrorMessage
        error={summary.error ?? filters.error ?? mechanics.error}
        fallbackMessage="Unable to load the Services page."
      />
      <StatusQuickFilters
        label="Service Record statuses"
        columnId={STATUS_COLUMN_ID}
        statuses={serviceRecordStatuses}
        shown={serviceRecordStatuses}
        allPicks="none"
        labels={serviceRecordStatusLabels}
        colours={serviceRecordStatusColorClassNames}
        counts={summary.data?.counts}
        columnFilters={tableController.columnFilters}
        onColumnFiltersChange={tableController.setColumnFilters}
      />
      <DataTable
        emptyMessage="No Service Records found."
        errorMessage={
          getApiQueryErrorMessage(recordsQuery.error, 'Unable to load Service Records.') ??
          getApiQueryErrorMessage(dueQuery.error, 'Unable to load the Machines due for a service.')
        }
        getRowAriaLabel={(row) => `Open the Machine ${row.machine.code}`}
        getRowClassName={(row) => (row.pinned ? PRIORITY_ROW_CLASS_NAME : undefined)}
        globalFilterPlaceholder="Search Machines and Mechanics…"
        isLoading={recordsQuery.isPending}
        paginationMode="cursor"
        loadMore={{
          hasNextPage: recordsQuery.hasNextPage,
          isFetchingNextPage: recordsQuery.isFetchingNextPage,
          loadedCount: records.length,
          onLoadMore: () => void recordsQuery.fetchNextPage(),
        }}
        onRowClick={(row) => void navigate({ to: '/contracting/fleet/$id/edit', params: { id: row.machine.id } })}
        table={table}
        total={total}
        totalLabel={(value) => countPhrase(value, 'Service Record', 'Service Records')}
      />
      {recordingMachineId ? (
        <RecordServiceDialog
          machineId={recordingMachineId}
          mechanicOptions={mechanics.options}
          onClose={() => setRecordingMachineId(null)}
        />
      ) : null}
    </PageLayout>
  );
}
