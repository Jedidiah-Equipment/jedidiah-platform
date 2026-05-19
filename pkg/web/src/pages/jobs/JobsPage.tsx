import { hasPermission, jobLifecycleStatusLabels } from '@pkg/domain';
import {
  JOB_LIST_STATUS_FILTERS,
  type JobLifecycleStatus,
  type JobListInput,
  type JobListStatusFilter,
  type JobSummary,
} from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ArrowRightIcon, CircleIcon } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { DateDisplay } from '@/components/DateDisplay.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useConstrainedTableState } from '@/components/data-table/hooks/use-constrained-table-state.js';
import { usePagedQueryResult } from '@/components/data-table/hooks/use-paged-query-result.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import { getPrimarySort, type SortOptions } from '@/components/data-table/table-state.js';
import { PrimaryLink } from '@/components/PrimaryLink.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select.js';
import { Separator } from '@/components/ui/separator.js';
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
  allowedSortIds: ['createdAt', 'id', 'lifecycleStatus'],
  defaultSort: {
    id: 'createdAt',
  },
};

export const JobsPage: React.FC<JobsPageProps> = ({ status }) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1">
            <CardDescription>Production</CardDescription>
            <CardTitle>Jobs</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Separator />
          <JobStatusFilter
            onStatusChange={(nextStatus) => {
              void navigate({
                search: {
                  status: nextStatus,
                },
                to: '/jobs',
              });
            }}
            status={status}
          />
          <JobTable status={status} />
        </CardContent>
      </Card>
    </div>
  );
};

const JobStatusFilter: React.FC<{
  onStatusChange: (status: JobListStatusFilter) => void;
  status: JobListStatusFilter;
}> = ({ onStatusChange, status }) => (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div className="text-sm font-medium">Lifecycle status</div>
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
  </div>
);

const JobTable: React.FC<{ status: JobListStatusFilter }> = ({ status }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const accessQuery = useAccess();
  const jobListInput = useJobListInput(status);
  const canOpenQuotes =
    hasPermission(accessQuery.data, 'quote:read') || hasPermission(accessQuery.data, 'quote:update');

  const jobsQuery = useQuery(
    trpc.jobs.list.queryOptions(jobListInput, {
      placeholderData: keepPreviousData,
    }),
  );
  const { items: jobs, total, isLoading } = usePagedQueryResult(jobsQuery);

  const {
    columnFilters,
    globalFilter,
    pagination,
    setColumnFilters,
    setGlobalFilter,
    setPageIndex,
    setPagination,
    setSorting,
    sorting,
  } = useJobTableStore(
    useShallow((state) => ({
      columnFilters: state.columnFilters,
      globalFilter: state.globalFilter,
      pagination: state.pagination,
      setColumnFilters: state.setColumnFilters,
      setGlobalFilter: state.setGlobalFilter,
      setPageIndex: state.setPageIndex,
      setPagination: state.setPagination,
      setSorting: state.setSorting,
      sorting: state.sorting,
    })),
  );
  const tableState = useConstrainedTableState({
    pagination,
    setPageIndex,
    sorting,
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
        header: 'Lifecycle Status',
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
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    pageCount: tableState.pageCount,
    rowCount: total,
    state: {
      columnFilters,
      globalFilter,
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

function useJobListInput(status: JobListStatusFilter): JobListInput {
  const { globalFilter, pagination, sorting } = useJobTableStore(
    useShallow((state) => ({
      globalFilter: state.globalFilter,
      pagination: state.pagination,
      sorting: state.sorting,
    })),
  );
  const sort = getPrimarySort(sorting, jobSortOptions);

  return useMemo(
    () =>
      ({
        filters: {
          lifecycleStatuses: status === 'all' ? [] : [status],
        },
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
        search: globalFilter,
        sortBy: sort.id,
        sortDirection: sort.desc ? 'desc' : 'asc',
      }) satisfies JobListInput,
    [globalFilter, pagination.pageIndex, pagination.pageSize, sort.desc, sort.id, status],
  );
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
