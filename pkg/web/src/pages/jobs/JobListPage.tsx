import { hasPermission } from '@pkg/domain';
import { DateOnlyIso, type JobListInput, JobSortBy, type UUID } from '@pkg/schema';
import { IconPlus } from '@tabler/icons-react';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
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

export const useJobListTableStore = createJobListTableStore('jobs-list-table');

const useCustomerJobListTableStore = createJobListTableStore('customer-jobs-list-table');

function createJobListTableStore(persistName: string) {
  return createPersistedDataTableStore({
    initialState: {
      sorting: [
        {
          desc: false,
          id: 'scheduledSlots',
        },
      ],
    },
    persistName,
    persistVersion: 4,
  });
}

const jobSortOptions: SortOptions<JobListInput> = {
  allowedSortIds: JobSortBy.options,
  defaultSort: {
    desc: false,
    id: 'scheduledSlots',
  },
};

export const JobListPage: React.FC<{ selectedJobId?: UUID | undefined }> = ({ selectedJobId }) => {
  const navigate = useNavigate();
  const accessQuery = useAccess();

  return (
    <PageLayout
      actions={
        hasPermission(accessQuery.data, 'job:create') ? (
          <Button render={<Link to="/jobs/stock-build" />}>
            <IconPlus data-icon="inline-start" />
            New Stock Build
          </Button>
        ) : null
      }
      description={jobListPageDescription}
      size="full"
      title="Job List"
    >
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

export const JobListTable: React.FC<{ customerId?: UUID }> = ({ customerId }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const accessQuery = useAccess();
  const canOpenJobs = hasPermission(accessQuery.data, 'job:read') || hasPermission(accessQuery.data, 'job:update');
  const canEditJobs = hasPermission(accessQuery.data, 'job:update');
  // Off by default, so the Job List opens on live work rather than years of finished Jobs.
  const [includeCompleted, setIncludeCompleted] = useState(false);

  const getListInputExtras = useCallback(
    (columnFilters: ColumnFiltersState) => {
      // Only completed Jobs carry a date, so the Complete range is meaningless while they are hidden.
      const completedOn = includeCompleted ? getDateRangeColumnFilterValue(columnFilters, 'completedOn') : {};

      return {
        columnFilters: {
          code: getColumnFilterValue(columnFilters, 'code'),
          ...(completedOn.end ? { completedOnEnd: DateOnlyIso.parse(completedOn.end) } : {}),
          ...(completedOn.start ? { completedOnStart: DateOnlyIso.parse(completedOn.start) } : {}),
          customerId: customerId ?? getColumnFilterValue(columnFilters, 'customer'),
          productSerialNumber: getColumnFilterValue(columnFilters, 'productSerialNumber'),
        },
        filters: { incompleteOnly: !includeCompleted },
        include: { scheduleState: true },
      } satisfies Pick<JobListInput, 'columnFilters' | 'filters' | 'include'>;
    },
    [customerId, includeCompleted],
  );

  const tableController = useServerSideTableController({
    store: customerId ? useCustomerJobListTableStore : useJobListTableStore,
    sortOptions: jobSortOptions,
    getListInputExtras,
  });
  const customersQuery = useQuery(
    trpc.jobs.customerOptions.queryOptions({
      cursor: 0,
      limit: 0,
      search: '',
      sortBy: 'companyName',
      sortDirection: 'asc',
    }),
  );

  const jobsQuery = useInfiniteQuery(
    trpc.jobs.list.infiniteQueryOptions(tableController.listInput, {
      ...cursorInfiniteQueryOptions,
      placeholderData: keepPreviousData,
    }),
  );
  const { items: jobs, total } = useCombinedCursorQueryPages(jobsQuery.data?.pages);

  const customerOptions = useMemo(
    () => toSelectOptions(customersQuery.data?.items ?? [], (customer) => customer.companyName),
    [customersQuery.data?.items],
  );
  const columns = useMemo(
    () =>
      createJobListColumns({
        canEditJobs,
        canOpenJobs,
        canFilterCompletedOn: includeCompleted,
        customerOptions,
        showCustomerColumn: !customerId,
      }),
    [canEditJobs, canOpenJobs, customerId, customerOptions, includeCompleted],
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
    manualSorting: true,
    onColumnFiltersChange: tableController.setColumnFilters,
    onGlobalFilterChange: tableController.setGlobalFilter,
    onSortingChange: tableController.setSorting,
    state: {
      columnFilters: tableController.columnFilters,
      globalFilter: tableController.globalFilter,
      columnPinning,
      sorting: tableController.sorting,
    },
  });

  const handleIncludeCompletedChange = (checked: boolean) => {
    setIncludeCompleted(checked);
    // Hiding completed Jobs also retires the Complete date filter, so a stale range cannot survive
    // in persisted table state and silently narrow the next look at completed work.
    if (!checked) {
      tableController.setColumnFilters((filters) => filters.filter((filter) => filter.id !== 'completedOn'));
    }
  };

  return (
    <DataTable
      emptyMessage={getJobsEmptyMessage({ includeCompleted })}
      errorMessage={getApiQueryErrorMessage(jobsQuery.error, 'Unable to load jobs.')}
      globalFilterPlaceholder="Search jobs..."
      isLoading={jobsQuery.isPending}
      paginationMode="cursor"
      loadMore={{
        hasNextPage: jobsQuery.hasNextPage,
        isFetchingNextPage: jobsQuery.isFetchingNextPage,
        loadedCount: jobs.length,
        onLoadMore: () => void jobsQuery.fetchNextPage(),
      }}
      onRowClick={canOpenJobs ? (job) => void navigate({ search: { job: job.id }, to: '/jobs/list' }) : undefined}
      rightSection={
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium" htmlFor="jobs-include-completed">
            <Switch
              checked={includeCompleted}
              id="jobs-include-completed"
              onCheckedChange={(checked) => handleIncludeCompletedChange(checked === true)}
              size="sm"
            />
            Include Completed
          </label>
        </div>
      }
      tableClassName={customerId ? 'min-w-[784px]' : 'min-w-[960px]'}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'job' : 'jobs'}`}
    />
  );
};

function getJobsEmptyMessage({ includeCompleted }: { includeCompleted: boolean }): string {
  return includeCompleted ? 'No jobs found.' : 'No open jobs. Turn on Include Completed to see finished work.';
}

function getColumnFilterValue(
  columnFilters: ColumnFiltersState,
  id: 'code' | 'customer' | 'productSerialNumber',
): string | undefined {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === 'string' && value ? value : undefined;
}

function getDateRangeColumnFilterValue(
  columnFilters: ColumnFiltersState,
  id: 'completedOn',
): { end?: string; start?: string } {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const range = value as { end?: unknown; start?: unknown };

  return {
    ...(typeof range.end === 'string' && range.end ? { end: range.end } : {}),
    ...(typeof range.start === 'string' && range.start ? { start: range.start } : {}),
  };
}
