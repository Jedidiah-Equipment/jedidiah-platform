import { hasPermission, jobLifecycleStatusLabels } from '@pkg/domain';
import {
  JOB_LIST_STATUS_FILTERS,
  type JobLifecycleStatus,
  type JobListInput,
  type JobListStatusFilter,
  JobSortBy,
  type JobSummary,
} from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ArrowRightIcon, CircleIcon } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';

import { DateDisplay } from '@/components/DateDisplay.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useConstrainedTableState } from '@/components/data-table/hooks/use-constrained-table-state.js';
import { usePagedQueryResult } from '@/components/data-table/hooks/use-paged-query-result.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { PrimaryLink } from '@/components/PrimaryLink.js';
import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select.js';
import { useAccess } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { getJobLifecycleStatusColorClassNames, JobLifecycleStatusBadge } from './components/JobLifecycleStatusBadge.js';
import { JobStageChips } from './components/JobStageChips.js';

type JobsPageProps = {
  status: JobListStatusFilter;
};

export const useJobTableStore = createPersistedDataTableStore({
  initialState: {
    sorting: [
      {
        desc: false,
        id: 'createdAt',
      },
    ],
  },
  persistName: 'jobs-table',
});

const jobSortOptions: SortOptions<JobListInput> = {
  allowedSortIds: JobSortBy.options,
  defaultSort: {
    id: 'createdAt',
  },
};

export const JobsPage: React.FC<JobsPageProps> = ({ status }) => {
  const navigate = useNavigate();

  return (
    <ListPageLayout description="Production" title="Jobs">
      <JobTable
        rightSection={
          <JobStatusFilter
            onStatusChange={(nextStatus) => {
              void navigate({ search: { status: nextStatus }, to: '/jobs' });
            }}
            status={status}
          />
        }
        status={status}
      />
    </ListPageLayout>
  );
};

const JobStatusFilter: React.FC<{
  onStatusChange: (status: JobListStatusFilter) => void;
  status: JobListStatusFilter;
}> = ({ onStatusChange, status }) => (
  <Select
    onValueChange={(value) => {
      if (!value || value === status) return;
      onStatusChange(value as JobListStatusFilter);
    }}
    value={status}
  >
    <SelectTrigger aria-label="Lifecycle status" className="w-full sm:w-48">
      <JobListStatusFilterSelectValue status={status} />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        {JOB_LIST_STATUS_FILTERS.map((option) => (
          <SelectItem key={option} leading={<JobListStatusFilterIcon status={option} />} value={option}>
            {getJobListStatusFilterLabel(option)}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
);

const JobTable: React.FC<{ rightSection?: React.ReactNode; status: JobListStatusFilter }> = ({
  rightSection,
  status,
}) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const accessQuery = useAccess();
  const canOpenQuotes =
    hasPermission(accessQuery.data, 'quote:read') || hasPermission(accessQuery.data, 'quote:update');

  const tableController = useServerSideTableController({
    store: useJobTableStore,
    sortOptions: jobSortOptions,
    getListInputExtras: () => getJobListInputExtras(status),
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

  const columns = useMemo<ColumnDef<JobSummary>[]>(() => {
    const baseColumns: ColumnDef<JobSummary>[] = [
      {
        accessorKey: 'createdAt',
        cell: ({ row }) => <DateDisplay date={row.original.createdAt} />,
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Created',
      },
      {
        accessorKey: 'code',
        cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Job code',
      },
      {
        accessorKey: 'productName',
        cell: ({ row }) => (
          <>
            {row.original.productName}
            <span className="ml-2 text-muted-foreground">{row.original.productModelCode}</span>
          </>
        ),
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Product',
      },
    ];

    if (canOpenQuotes) {
      baseColumns.push({
        accessorKey: 'quoteCode',
        cell: ({ row }) => <JobQuoteCode quoteCode={row.original.quoteCode} quoteId={row.original.quoteId} />,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Quote',
      });
    }

    baseColumns.push(
      {
        accessorKey: 'dueDate',
        cell: ({ row }) => <DateDisplay date={row.original.dueDate} emptyValue="No date" />,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Due',
      },
      {
        accessorKey: 'lifecycleStatus',
        cell: ({ row }) => <JobLifecycleStatusBadge status={row.original.lifecycleStatus} />,
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Status',
      },
      {
        cell: ({ row }) => <JobStageChips stages={row.original.stages} />,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Departments',
        id: 'stages',
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              aria-label={`Open job ${row.original.code}`}
              onClick={() => navigate({ params: { id: row.original.id }, to: '/jobs/$id' })}
              size="icon-sm"
              variant="outline"
            >
              <ArrowRightIcon />
            </Button>
          </div>
        ),
        enableColumnFilter: false,
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        meta: {
          cellClassName: 'text-right',
          headerClassName: 'w-20 text-right',
        },
      },
    );

    return baseColumns;
  }, [canOpenQuotes, navigate]);

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
      pagination: tableState.pagination,
      sorting: tableState.sorting,
    },
  });

  return (
    <DataTable
      emptyMessage="No jobs found."
      errorMessage={getApiQueryErrorMessage(jobsQuery.error, 'Unable to load jobs.')}
      globalFilterPlaceholder="Search jobs..."
      isLoading={isLoading}
      rightSection={rightSection}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'job' : 'jobs'}`}
    />
  );
};

const JobQuoteCode: React.FC<{
  quoteCode: JobSummary['quoteCode'];
  quoteId: JobSummary['quoteId'];
}> = ({ quoteCode, quoteId }) => {
  if (!quoteCode) {
    return <span className="text-muted-foreground">Direct job</span>;
  }

  if (quoteId) {
    return (
      <PrimaryLink params={{ id: quoteId }} to="/quotes/$id">
        {quoteCode}
      </PrimaryLink>
    );
  }

  return <span className="font-medium">{quoteCode}</span>;
};

function getJobListInputExtras(status: JobListStatusFilter) {
  return {
    filters: {
      lifecycleStatuses: status === 'all' ? [] : [status],
    },
  } satisfies Pick<JobListInput, 'filters'>;
}

function getJobListStatusFilterLabel(status: JobListStatusFilter): string {
  if (status === 'all') return 'All';

  return jobLifecycleStatusLabels[status];
}

const JobListStatusFilterSelectValue: React.FC<{ status: JobListStatusFilter }> = ({ status }) => (
  <span className="flex min-w-0 flex-1 items-center gap-2 text-left" data-slot="select-value">
    <JobListStatusFilterIcon status={status} />
    <span className="truncate">{getJobListStatusFilterLabel(status)}</span>
  </span>
);

const JobListStatusFilterIcon: React.FC<{ status: JobListStatusFilter }> = ({ status }) => {
  const iconClassName =
    status === 'all'
      ? 'fill-gray-400 text-gray-400'
      : getJobLifecycleStatusColorClassNames(status satisfies JobLifecycleStatus).icon;

  return (
    <span className="inline-flex size-3 shrink-0 items-center justify-center">
      <CircleIcon aria-hidden="true" className={iconClassName} strokeWidth={0} />
    </span>
  );
};
