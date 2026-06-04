import { hasPermission } from '@pkg/domain';
import { type JobListInput, JobSortBy, type JobSummary } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type React from 'react';
import { useMemo } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useConstrainedTableState } from '@/components/data-table/hooks/use-constrained-table-state.js';
import { usePagedQueryResult } from '@/components/data-table/hooks/use-paged-query-result.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
import { useAccess } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { JobStageChips } from './components/JobStageChips.js';

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
  persistVersion: 3,
});

const jobSortOptions: SortOptions<JobListInput> = {
  allowedSortIds: JobSortBy.options,
  defaultSort: {
    id: 'createdAt',
  },
};

export const JobsPage: React.FC = () => {
  return (
    <ListPageLayout description="Production" title="Jobs">
      <JobTable />
    </ListPageLayout>
  );
};

const JobTable: React.FC = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const accessQuery = useAccess();
  const canSeeQuotes = hasPermission(accessQuery.data, 'quote:read') || hasPermission(accessQuery.data, 'quote:update');

  const tableController = useServerSideTableController({
    store: useJobTableStore,
    sortOptions: jobSortOptions,
    getListInputExtras: getJobListInputExtras,
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
        accessorKey: 'productSerialNumber',
        cell: ({ row }) => <span className="font-medium">{row.original.productSerialNumber}</span>,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Product serial',
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

    if (canSeeQuotes) {
      baseColumns.push({
        accessorKey: 'quoteCode',
        cell: ({ row }) => <JobQuoteCode quoteCode={row.original.quoteCode} />,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Quote',
      });
    }

    baseColumns.push({
      cell: ({ row }) => <JobStageChips stages={row.original.stages} />,
      enableColumnFilter: false,
      enableSorting: false,
      header: 'Departments',
      id: 'stages',
    });

    return baseColumns;
  }, [canSeeQuotes]);

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
      getRowAriaLabel={(job) => `Open job ${job.code}`}
      globalFilterPlaceholder="Search jobs..."
      isLoading={isLoading}
      onRowClick={(job) => navigate({ params: { id: job.id }, to: '/jobs/$id' })}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'job' : 'jobs'}`}
    />
  );
};

const JobQuoteCode: React.FC<{
  quoteCode: JobSummary['quoteCode'];
}> = ({ quoteCode }) => {
  if (!quoteCode) {
    return <span className="text-muted-foreground">Direct job</span>;
  }

  return <span className="font-medium">{quoteCode}</span>;
};

function getJobListInputExtras() {
  return {
    filters: {},
  } satisfies Pick<JobListInput, 'filters'>;
}
