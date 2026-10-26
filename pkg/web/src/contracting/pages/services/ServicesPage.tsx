import { countPhrase } from '@pkg/domain';
import type { ServiceRecordListInput, ServiceRecordStatus } from '@pkg/schema/contracting';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useDataTable } from '@/components/data-table/features.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { PRIORITY_ROW_CLASS_NAME } from '@/components/data-table/priority-row.js';
import { createDataTableStore, createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useMachinesDueForService } from '@/contracting/hooks/use-machines-due-for-service.js';
import { BookServiceDialog } from '@/contracting/pages/fleet/BookServiceDialog.js';
import { useServiceMechanicOptions } from '@/contracting/pages/fleet/use-service-mechanic-options.js';
import { useCan } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { useServicesColumns } from './services-columns.js';
import { dueRow, recordRow, type ServicesTableRow, STATUS_COLUMN_ID, servicesTableFilters } from './types.js';

const useServicesTableStore = createPersistedDataTableStore({
  initialState: {
    columnFilters: [{ id: STATUS_COLUMN_ID, value: ['open'] satisfies ServiceRecordStatus[] }],
    sorting: [{ id: 'startDate', desc: true }],
  },
  persistName: 'contracting-services-table',
  // 3: Booked In became the default status filter.
  persistVersion: 3,
});

const serviceRecordSortOptions: SortOptions<ServiceRecordListInput> = {
  allowedSortIds: ['startDate'],
  defaultSort: { id: 'startDate', desc: true },
};

/**
 * The Service Records still Booked In, unless the Status filter asks for Closed ones too, with the Machines Due for Service pinned above them in the priority-quote
 * pattern: their own query, so no filter, search or sort on the table can hide one.
 */
export function ServicesPage() {
  const canBook = useCan('contracting_service:update').can;
  const [booking, setBooking] = useState(false);
  const mechanics = useServiceMechanicOptions(canBook);
  return (
    <PageLayout
      title="Services"
      description="Machines due for a service first, then the services Booked In. Booking one in takes it off the top."
      size="full"
      actions={canBook ? <Button onClick={() => setBooking(true)}>Book a service</Button> : undefined}
    >
      <ServicesTable />
      {booking ? (
        <BookServiceDialog machineId={null} mechanicOptions={mechanics.options} onClose={() => setBooking(false)} />
      ) : null}
    </PageLayout>
  );
}

/**
 * The Services table. Scoped to a Machine, only its Service Records and, while it is due, the Machine itself pinned
 * above them; a scoped table keeps its filters only while it is open, so it opens unfiltered every time.
 */
export function ServicesTable({ machineId }: { machineId?: string }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const canBook = useCan('contracting_service:update').can;
  const [bookingMachineId, setBookingMachineId] = useState<string | null>(null);
  const [useMachineServicesTableStore] = useState(() =>
    machineId ? createDataTableStore({ sorting: [{ id: 'startDate', desc: true }] }) : null,
  );
  const getListInputExtras = useCallback(
    (columnFilters: ColumnFiltersState) => ({
      ...servicesTableFilters(columnFilters),
      ...(machineId ? { machineIds: [machineId] } : {}),
    }),
    [machineId],
  );
  const tableController = useServerSideTableController({
    store: useMachineServicesTableStore ?? useServicesTableStore,
    sortOptions: serviceRecordSortOptions,
    getListInputExtras,
  });
  const recordsQuery = useInfiniteQuery(
    trpc.contractingServices.list.infiniteQueryOptions(tableController.listInput, {
      ...cursorInfiniteQueryOptions,
      placeholderData: keepPreviousData,
    }),
  );
  const dueQuery = useMachinesDueForService();
  const filters = useQuery(trpc.contractingServices.options.filters.queryOptions());
  const mechanics = useServiceMechanicOptions(canBook);
  const { items: records, total } = useCombinedCursorQueryPages(recordsQuery.data?.pages);
  const rows = useMemo<ServicesTableRow[]>(
    () => [
      ...(dueQuery.data ?? []).filter((machine) => !machineId || machine.id === machineId).map(dueRow),
      ...records.map(recordRow),
    ],
    [dueQuery.data, records, machineId],
  );
  const columns = useServicesColumns({
    filters: filters.data,
    hasMachineFilter: !machineId,
    onBookService: canBook ? setBookingMachineId : undefined,
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
    <>
      <ErrorMessage
        error={filters.error ?? mechanics.error}
        fallbackMessage="Unable to load the Service Record filters."
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
      {bookingMachineId ? (
        <BookServiceDialog
          machineId={bookingMachineId}
          mechanicOptions={mechanics.options}
          onClose={() => setBookingMachineId(null)}
        />
      ) : null}
    </>
  );
}
