import { hasPermission } from '@pkg/domain';
import { type JobListInput, JobSortBy, type UUID } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table/DataTable.js';
import { useConstrainedTableState } from '@/components/data-table/hooks/use-constrained-table-state.js';
import { usePagedQueryResult } from '@/components/data-table/hooks/use-paged-query-result.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Switch } from '@/components/ui/switch.js';
import { toSelectOptions } from '@/hooks/options/index.js';
import { useAccess } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { jobListPageDescription } from '@/utils/page-descriptions.js';

import {
  createJobListColumns,
  jobTablePinnedLeftColumns,
  jobTablePinnedRightColumns,
} from './components/JobListTableColumns.js';
import { JobSheet } from './components/JobSheet.js';

export const useJobListTableStore = createPersistedDataTableStore({
  initialState: {
    sorting: [
      {
        desc: false,
        id: 'scheduledSlots',
      },
    ],
  },
  persistName: 'jobs-list-table',
  persistVersion: 2,
});

const jobSortOptions: SortOptions<JobListInput> = {
  allowedSortIds: JobSortBy.options,
  defaultSort: {
    desc: false,
    id: 'scheduledSlots',
  },
};

export const JobListPage: React.FC<{ selectedJobId?: UUID | undefined }> = ({ selectedJobId }) => {
  const navigate = useNavigate();

  return (
    <PageLayout description={jobListPageDescription} size="full" title="Job List">
      <JobListTable />
      {selectedJobId ? (
        <JobSheet
          key={selectedJobId}
          jobId={selectedJobId}
          onClose={() => navigate({ search: {}, to: '/jobs/list' })}
        />
      ) : null}
    </PageLayout>
  );
};

const JobListTable: React.FC = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const accessQuery = useAccess();
  const canOpenJobs = hasPermission(accessQuery.data, 'job:read') || hasPermission(accessQuery.data, 'job:update');
  const canEditJobs = hasPermission(accessQuery.data, 'job:update');
  const [invoicedOnly, setInvoicedOnly] = useState(false);

  const getListInputExtras = useCallback(
    (columnFilters: ColumnFiltersState) =>
      ({
        columnFilters: {
          code: getColumnFilterValue(columnFilters, 'code'),
          customerId: getColumnFilterValue(columnFilters, 'customer'),
          invoiceNumber: getColumnFilterValue(columnFilters, 'invoiceNumber'),
          productSerialNumber: getColumnFilterValue(columnFilters, 'productSerialNumber'),
        },
        filters: { invoicedOnly },
        include: { scheduleState: true },
      }) satisfies Pick<JobListInput, 'columnFilters' | 'filters' | 'include'>,
    [invoicedOnly],
  );

  const tableController = useServerSideTableController({
    store: useJobListTableStore,
    sortOptions: jobSortOptions,
    getListInputExtras,
  });
  const customersQuery = useQuery(
    trpc.jobs.customerOptions.queryOptions({
      page: 1,
      pageSize: 0,
      search: '',
      sortBy: 'companyName',
      sortDirection: 'asc',
    }),
  );

  const jobsQuery = useQuery(
    trpc.jobs.list.queryOptions(tableController.listInput, {
      placeholderData: keepPreviousData,
    }),
  );
  const { items: jobs, total, isLoading } = usePagedQueryResult(jobsQuery);

  const tableState = useConstrainedTableState({
    pagination: tableController.pagination,
    setPageIndex: tableController.setPageIndex,
    sorting: tableController.sorting,
    sortOptions: jobSortOptions,
    total,
  });

  const customerOptions = useMemo(
    () => toSelectOptions(customersQuery.data?.items ?? [], (customer) => customer.companyName),
    [customersQuery.data?.items],
  );
  const columns = useMemo(
    () =>
      createJobListColumns({
        canEditJobs,
        canOpenJobs,
        customerOptions,
      }),
    [canEditJobs, canOpenJobs, customerOptions],
  );
  const columnPinning = useMemo(
    () => ({
      left: jobTablePinnedLeftColumns,
      right: canOpenJobs ? jobTablePinnedRightColumns : [],
    }),
    [canOpenJobs],
  );

  const table = useReactTable({
    columns,
    data: jobs,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    onColumnFiltersChange: tableController.setColumnFilters,
    onGlobalFilterChange: tableController.setGlobalFilter,
    onPaginationChange: tableController.setPagination,
    onSortingChange: tableController.setSorting,
    pageCount: tableState.pageCount,
    rowCount: total,
    state: {
      columnFilters: tableController.columnFilters,
      globalFilter: tableController.globalFilter,
      columnPinning,
      pagination: tableState.pagination,
      sorting: tableState.sorting,
    },
  });

  const handleInvoicedOnlyChange = (checked: boolean) => {
    setInvoicedOnly(checked);
    tableController.setPageIndex(0);
  };

  return (
    <DataTable
      emptyMessage={invoicedOnly ? 'No invoiced jobs.' : 'No jobs found.'}
      errorMessage={getApiQueryErrorMessage(jobsQuery.error, 'Unable to load jobs.')}
      globalFilterPlaceholder="Search jobs..."
      isLoading={isLoading}
      onRowClick={canOpenJobs ? (job) => void navigate({ search: { job: job.id }, to: '/jobs/list' }) : undefined}
      rightSection={
        <label className="flex items-center gap-2 text-sm font-medium" htmlFor="jobs-is-invoiced">
          <Switch
            checked={invoicedOnly}
            id="jobs-is-invoiced"
            onCheckedChange={(checked) => handleInvoicedOnlyChange(checked === true)}
            size="sm"
          />
          Is Invoiced
        </label>
      }
      tableClassName="min-w-[1120px]"
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'job' : 'jobs'}`}
    />
  );
};

function getColumnFilterValue(
  columnFilters: ColumnFiltersState,
  id: 'code' | 'customer' | 'invoiceNumber' | 'productSerialNumber',
): string | undefined {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === 'string' && value ? value : undefined;
}
