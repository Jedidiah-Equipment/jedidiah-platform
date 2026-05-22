import { hasPermission } from '@pkg/domain';
import { type QuoteListInput, QuoteSortBy, QuoteStatus, type QuoteSummary } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ColumnDef, type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ArrowRightIcon, BriefcaseBusinessIcon, PlusIcon } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { ButtonLink } from '@/components/button/ButtonLink.js';
import { DateDisplay } from '@/components/common/DateDisplay.js';
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
import { CreateJobDialog } from '@/pages/jobs/components/CreateJobDialog.js';
import { formatCurrency } from '@/utils/number.js';
import { QuoteLinkedJobs } from './components/QuoteLinkedJobs.js';
import { QuoteStatusBadge, quoteStatusLabels } from './components/QuoteStatusBadge.js';
import { canCreateJobFromQuote } from './quote-job-eligibility.js';

export const useQuoteTableStore = createPersistedDataTableStore({
  initialState: {
    sorting: [
      {
        desc: true,
        id: 'createdAt',
      },
    ],
  },
  persistName: 'quotes-table',
});

const quoteSortOptions: SortOptions<QuoteListInput> = {
  allowedSortIds: QuoteSortBy.options,
  defaultSort: {
    desc: true,
    id: 'createdAt',
  },
};

const quoteStatusFilterOptions = QuoteStatus.options.map((status) => ({
  label: quoteStatusLabels[status],
  value: status,
}));

export const QuotesPage: React.FC = () => {
  return (
    <ListPageLayout
      action={
        <ButtonLink to="/quotes/new">
          <PlusIcon data-icon="inline-start" />
          New quote
        </ButtonLink>
      }
      description="Sales"
      title="Quotes"
    >
      <QuoteTable />
    </ListPageLayout>
  );
};

const QuoteTable: React.FC = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const accessQuery = useAccess();
  const canOpenJobs = hasPermission(accessQuery.data, 'job:read') || hasPermission(accessQuery.data, 'job:update');
  const canCreateJob = hasPermission(accessQuery.data, 'job:create');

  const tableController = useServerSideTableController({
    store: useQuoteTableStore,
    sortOptions: quoteSortOptions,
    getListInputExtras: getQuoteListInputExtras,
  });

  const quotesQuery = useQuery(
    trpc.quotes.list.queryOptions(tableController.listInput, {
      placeholderData: keepPreviousData,
    }),
  );
  const { items: quotes, total, isLoading } = usePagedQueryResult(quotesQuery);

  const tableState = useConstrainedTableState({
    pagination: tableController.pagination,
    setPageIndex: tableController.setPageIndex,
    sorting: tableController.sorting,
    sortOptions: quoteSortOptions,
    total,
  });

  const columns = useMemo<ColumnDef<QuoteSummary>[]>(
    () => [
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
        header: 'Quote',
      },
      {
        accessorKey: 'customerCompanyName',
        cell: ({ row }) => row.original.customerCompanyName,
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Customer',
      },
      {
        accessorKey: 'productName',
        cell: ({ row }) => (
          <>
            {row.original.productName ?? <span className="text-muted-foreground">Not set</span>}
            {row.original.productModelCode ? (
              <span className="ml-2 text-muted-foreground">{row.original.productModelCode}</span>
            ) : null}
          </>
        ),
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Product',
      },
      {
        accessorKey: 'total',
        cell: ({ row }) => {
          const currencyCode = row.original.quotedCurrencyCode ?? row.original.productCurrencyCode;
          return row.original.total === null || currencyCode === null
            ? 'Not set'
            : formatCurrency(row.original.total, currencyCode);
        },
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Total',
      },
      {
        accessorKey: 'validUntil',
        cell: ({ row }) => <DateDisplay date={row.original.validUntil} emptyValue="Not set" />,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Valid until',
      },
      {
        accessorKey: 'status',
        cell: ({ row }) => <QuoteStatusBadge status={row.original.status} />,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Status',
        meta: {
          filterOptions: quoteStatusFilterOptions,
          filterVariant: 'multi-select',
        },
      },
      {
        accessorKey: 'linkedJobs',
        cell: ({ row }) => <QuoteLinkedJobs canOpenJobs={canOpenJobs} linkedJobs={row.original.linkedJobs} />,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Job',
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {canCreateJob && canCreateJobFromQuote(row.original.status) ? (
              <CreateJobDialog
                quote={row.original}
                trigger={
                  <Button aria-label={`Create job from quote ${row.original.code}`} size="icon-sm" variant="outline">
                    <BriefcaseBusinessIcon />
                  </Button>
                }
              />
            ) : null}
            <Button
              aria-label={`Open quote ${row.original.code}`}
              onClick={() => navigate({ params: { id: row.original.id }, to: '/quotes/$id' })}
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
    ],
    [canCreateJob, canOpenJobs, navigate],
  );

  const table = useReactTable({
    columns,
    data: quotes,
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
      emptyMessage="No quotes found."
      errorMessage={getApiQueryErrorMessage(quotesQuery.error, 'Unable to load quotes.')}
      globalFilterPlaceholder="Search quotes..."
      isLoading={isLoading}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'quote' : 'quotes'}`}
    />
  );
};

function getStatusFilterValues(columnFilters: ColumnFiltersState) {
  const value = columnFilters.find((filter) => filter.id === 'status')?.value;

  return Array.isArray(value)
    ? value.filter((item): item is QuoteSummary['status'] => QuoteStatus.safeParse(item).success)
    : [];
}

function getQuoteListInputExtras(columnFilters: ColumnFiltersState) {
  return {
    filters: {
      statuses: getStatusFilterValues(columnFilters),
    },
  } satisfies Pick<QuoteListInput, 'filters'>;
}
