import { hasPermission } from '@pkg/domain';
import { type JobListInput, JobSortBy, type JobSummary } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ArrowRightIcon, PlusIcon } from 'lucide-react';
import type React from 'react';
import { useCallback, useMemo } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { PrimaryLink } from '@/components/common/PrimaryLink.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useConstrainedTableState } from '@/components/data-table/hooks/use-constrained-table-state.js';
import { usePagedQueryResult } from '@/components/data-table/hooks/use-paged-query-result.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useAccess } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { CreateJobDialog } from './components/CreateJobDialog.js';
import { JobStageChips } from './components/JobStageChips.js';
import { JobStatusBadge } from './components/JobStatusBadge.js';

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
  persistVersion: 2,
});

const jobSortOptions: SortOptions<JobListInput> = {
  allowedSortIds: JobSortBy.options,
  defaultSort: {
    id: 'createdAt',
  },
};

export const JobsPage: React.FC = () => {
  const accessQuery = useAccess();
  const canCreateJob = hasPermission(accessQuery.data, 'job:create');

  return (
    <ListPageLayout
      action={
        canCreateJob ? (
          <CreateJobDialog
            trigger={
              <Button>
                <PlusIcon data-icon="inline-start" />
                New job
              </Button>
            }
          />
        ) : undefined
      }
      description="Production"
      title="Jobs"
    >
      <JobTable />
    </ListPageLayout>
  );
};

const JobTable: React.FC = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const accessQuery = useAccess();
  const canOpenQuotes =
    hasPermission(accessQuery.data, 'quote:read') || hasPermission(accessQuery.data, 'quote:update');
  const getListInputExtras = useCallback(() => getJobListInputExtras(), []);

  const tableController = useServerSideTableController({
    store: useJobTableStore,
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

    baseColumns.push({
      accessorKey: 'dueDate',
      cell: ({ row }) => <DateDisplay date={row.original.dueDate} emptyValue="No date" />,
      enableColumnFilter: false,
      enableSorting: true,
      header: 'Due date',
    });

    baseColumns.push(
      {
        accessorKey: 'status',
        cell: ({ row }) => <JobStatusBadge status={row.original.status} />,
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

function getJobListInputExtras() {
  return {
    filters: {},
  } satisfies Pick<JobListInput, 'filters'>;
}
