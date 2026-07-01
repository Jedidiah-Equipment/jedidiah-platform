import { hasPermission } from '@pkg/domain';
import { type JobListInput, JobSortBy } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
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
import { useAccess } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { jobListPageDescription } from '@/utils/page-descriptions.js';

import { createJobListColumns } from './components/JobListTableColumns.js';

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
  persistVersion: 1,
});

const jobSortOptions: SortOptions<JobListInput> = {
  allowedSortIds: JobSortBy.options,
  defaultSort: {
    desc: false,
    id: 'scheduledSlots',
  },
};

export const JobListPage: React.FC = () => (
  <PageLayout description={jobListPageDescription} size="full" title="Job List">
    <JobListTable />
  </PageLayout>
);

const JobListTable: React.FC = () => {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const canOpenJobs = hasPermission(accessQuery.data, 'job:read') || hasPermission(accessQuery.data, 'job:update');
  const [unscheduledOnly, setUnscheduledOnly] = useState(false);

  const getListInputExtras = useCallback(
    () =>
      ({
        filters: { unscheduledOnly },
        include: { scheduleState: true },
      }) satisfies Pick<JobListInput, 'filters' | 'include'>,
    [unscheduledOnly],
  );

  const tableController = useServerSideTableController({
    store: useJobListTableStore,
    sortOptions: jobSortOptions,
    getListInputExtras,
  });

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

  const columns = useMemo(() => createJobListColumns({ canOpenJobs }), [canOpenJobs]);

  const table = useReactTable({
    columns,
    data: jobs,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    onGlobalFilterChange: tableController.setGlobalFilter,
    onPaginationChange: tableController.setPagination,
    onSortingChange: tableController.setSorting,
    pageCount: tableState.pageCount,
    rowCount: total,
    state: {
      globalFilter: tableController.globalFilter,
      pagination: tableState.pagination,
      sorting: tableState.sorting,
    },
  });

  const handleUnscheduledOnlyChange = (checked: boolean) => {
    setUnscheduledOnly(checked);
    tableController.setPageIndex(0);
  };

  return (
    <DataTable
      emptyMessage={unscheduledOnly ? 'No unscheduled jobs.' : 'No jobs found.'}
      errorMessage={getApiQueryErrorMessage(jobsQuery.error, 'Unable to load jobs.')}
      globalFilterPlaceholder="Search jobs..."
      isLoading={isLoading}
      rightSection={
        <label
          className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground"
          htmlFor="jobs-unscheduled-only"
        >
          <Switch
            checked={unscheduledOnly}
            id="jobs-unscheduled-only"
            onCheckedChange={(checked) => handleUnscheduledOnlyChange(checked === true)}
          />
          Unscheduled only
        </label>
      }
      tableClassName="min-w-[880px]"
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'job' : 'jobs'}`}
    />
  );
};
