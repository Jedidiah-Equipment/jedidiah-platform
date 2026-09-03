import { hasPermission } from '@pkg/domain';
import { DateOnlyIso, type JobListInput, JobSortBy, type UUID } from '@pkg/schema';
import { IconDownload, IconLoader2, IconPlus } from '@tabler/icons-react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ColumnFiltersState } from '@tanstack/react-table';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useDataTable } from '@/components/data-table/features.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Switch } from '@/components/ui/switch.js';
import { toSelectOptions } from '@/hooks/options/index.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { jobListPageDescription } from '@/utils/page-descriptions.js';

import {
  createJobListColumns,
  jobTablePinnedEndColumns,
  jobTablePinnedStartColumns,
} from './components/JobListTableColumns.js';
import { JobSheet } from './components/JobSheet.js';
import { downloadJobSalesExport } from './job-sales-export.js';

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
  const canCreateJob = hasPermission(accessQuery.data, 'job:create');

  return (
    <JobListTable
      render={({ exportAction, tableContent }) => (
        <PageLayout
          actions={
            exportAction || canCreateJob ? (
              <>
                {exportAction}
                {canCreateJob ? (
                  <Button render={<Link to="/equipment/jobs/stock-build" />} size="default">
                    <IconPlus data-icon="inline-start" />
                    New Stock Build
                  </Button>
                ) : null}
              </>
            ) : null
          }
          description={jobListPageDescription}
          size="full"
          title="Job List"
        >
          {tableContent}
          {selectedJobId ? (
            <JobSheet
              key={selectedJobId}
              jobId={selectedJobId}
              onClose={() => navigate({ search: {}, to: '/equipment/jobs/list' })}
            />
          ) : null}
        </PageLayout>
      )}
    />
  );
};

type JobListTableProps = {
  customerId?: UUID;
  render?: ((view: { exportAction: React.ReactNode; tableContent: React.ReactNode }) => React.ReactNode) | undefined;
};

export const JobListTable: React.FC<JobListTableProps> = ({ customerId, render }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const showMutationError = useApiMutationErrorToast();
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

  // One row crosses the ledger, the Job and the Quote, so the button mirrors the API's all-of gate
  // rather than `job:read` alone — see `jobs.salesExport`.
  const canExportSales =
    hasPermission(accessQuery.data, 'inventory_cost:read') &&
    hasPermission(accessQuery.data, 'job:read') &&
    hasPermission(accessQuery.data, 'quote:read');
  const salesExportMutation = useMutation({
    mutationFn: () =>
      queryClient.fetchQuery(
        trpc.jobs.salesExport.queryOptions({
          columnFilters: tableController.listInput.columnFilters,
          search: tableController.listInput.search,
        }),
      ),
    onError: (error) => showMutationError(error, 'Unable to export completed jobs.'),
    onSuccess: (rows) => downloadJobSalesExport(rows),
  });

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
      start: jobTablePinnedStartColumns,
      end: canOpenJobs ? jobTablePinnedEndColumns : [],
    }),
    [canOpenJobs],
  );

  const table = useDataTable({
    columns,
    data: jobs,
    enableSortingRemoval: false,
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

  const dropCompletedOnFilter = useCallback(() => {
    tableController.setColumnFilters((filters) => filters.filter((filter) => filter.id !== 'completedOn'));
  }, [tableController.setColumnFilters]);

  const handleIncludeCompletedChange = (checked: boolean) => {
    setIncludeCompleted(checked);
    // Hiding completed Jobs also retires the Complete date filter, so a stale range cannot survive
    // in persisted table state and silently narrow the next look at completed work.
    if (!checked) {
      dropCompletedOnFilter();
    }
  };

  // The same cleanup on arrival. Column filters persist to storage but `includeCompleted` resets to
  // off on every mount, so a range set before a reload would otherwise sit in the store unseen —
  // its control is hidden while the switch is off — and quietly widen the next export to every
  // completed Job in the plant's history.
  useEffect(() => {
    if (!includeCompleted) {
      dropCompletedOnFilter();
    }
  }, [dropCompletedOnFilter, includeCompleted]);

  const exportAction = canExportSales ? (
    <Button
      disabled={salesExportMutation.isPending}
      onClick={() => salesExportMutation.mutate()}
      size={render ? 'default' : 'sm'}
      variant="outline"
    >
      {salesExportMutation.isPending ? (
        <IconLoader2 className="animate-spin" data-icon="inline-start" />
      ) : (
        <IconDownload data-icon="inline-start" />
      )}
      Export Completed
    </Button>
  ) : null;

  const tableContent = (
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
      onRowClick={
        canOpenJobs ? (job) => void navigate({ search: { job: job.id }, to: '/equipment/jobs/list' }) : undefined
      }
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
          {render ? null : exportAction}
        </div>
      }
      tableClassName={customerId ? 'min-w-[784px]' : 'min-w-[960px]'}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'job' : 'jobs'}`}
    />
  );

  return render ? render({ exportAction, tableContent }) : tableContent;
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
