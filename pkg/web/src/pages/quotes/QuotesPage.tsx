import { computeQuoteTotal, formatCurrency, hasPermission } from '@pkg/domain';
import { type QuoteListInput, QuoteSortBy, QuoteStatus, type QuoteSummary } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ColumnDef, type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { PencilIcon, PlusIcon } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
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
import { useCustomerForQuoteOptions, useProductForQuoteOptions, useSalesPersonOptions } from '@/hooks/options/index.js';
import { useAccess } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { GenerateJobFromQuoteDialog } from './components/GenerateJobFromQuoteDialog.js';
import { QuoteLinkedJobs } from './components/QuoteLinkedJobs.js';
import { QuoteStatusBadge, quoteStatusLabels } from './components/QuoteStatusBadge.js';
import { QuoteCreateDialog } from './QuoteCreateDialog.js';

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
  persistVersion: 3,
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
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <>
      <ListPageLayout
        action={
          <Button onClick={() => setIsCreateOpen(true)} type="button">
            <PlusIcon data-icon="inline-start" />
            New quote
          </Button>
        }
        description="Sales"
        title="Quotes"
      >
        <QuoteTable />
      </ListPageLayout>
      <QuoteCreateDialog onOpenChange={setIsCreateOpen} open={isCreateOpen} />
    </>
  );
};

const QuoteTable: React.FC = () => {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const canOpenJobs = hasPermission(accessQuery.data, 'job:read') || hasPermission(accessQuery.data, 'job:update');
  const canCreateJob = hasPermission(accessQuery.data, 'job:create');
  const canUpdateQuote = hasPermission(accessQuery.data, 'quote:update');
  const customerOptions = useCustomerForQuoteOptions({ pageSize: 0 });
  const productOptions = useProductForQuoteOptions({ pageSize: 0 });
  const salespersonOptions = useSalesPersonOptions();

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
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Customer',
        meta: {
          filterOptions: customerOptions.selectOptions,
          filterVariant: 'select',
        },
      },
      {
        accessorKey: 'salesPersonName',
        cell: ({ row }) => <SalesPersonCell quote={row.original} />,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Salesperson',
        meta: {
          filterOptions: salespersonOptions.selectOptions,
          filterVariant: 'select',
        },
      },
      {
        accessorKey: 'productName',
        cell: ({ row }) => (
          <>
            {row.original.productName}
            <span className="ml-2 text-muted-foreground">{row.original.productModelCode}</span>
          </>
        ),
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Product',
        meta: {
          filterOptions: productOptions.selectOptions,
          filterVariant: 'select',
        },
      },
      {
        id: 'total',
        cell: ({ row }) => {
          return formatCurrency(getQuoteTotal(row.original), row.original.quotedCurrencyCode);
        },
        enableColumnFilter: false,
        enableSorting: false,
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
      ...(canCreateJob || canUpdateQuote
        ? [
            {
              id: 'actions',
              cell: ({ row }) => (
                <div className="flex justify-end gap-1">
                  <GenerateJobFromQuoteDialog quote={row.original} size="icon-sm" />
                  {canUpdateQuote ? (
                    <ButtonLink
                      aria-label={`Edit quote ${row.original.code}`}
                      params={{ id: row.original.id }}
                      size="icon-sm"
                      to="/quotes/$id/edit"
                      variant="outline"
                    >
                      <PencilIcon />
                    </ButtonLink>
                  ) : null}
                </div>
              ),
              enableColumnFilter: false,
              enableSorting: false,
              header: () => <span className="sr-only">Actions</span>,
              meta: {
                cellClassName: 'text-right',
                headerClassName: 'w-20 text-right',
              },
            } satisfies ColumnDef<QuoteSummary>,
          ]
        : []),
    ],
    [
      canOpenJobs,
      canCreateJob,
      canUpdateQuote,
      customerOptions.selectOptions,
      productOptions.selectOptions,
      salespersonOptions.selectOptions,
    ],
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
      customerId: getIdFilterValue(columnFilters, 'customerCompanyName'),
      productId: getIdFilterValue(columnFilters, 'productName'),
      salesPersonId: getIdFilterValue(columnFilters, 'salesPersonName'),
      statuses: getStatusFilterValues(columnFilters),
    },
  } satisfies Pick<QuoteListInput, 'filters'>;
}

function getIdFilterValue(
  columnFilters: ColumnFiltersState,
  id: 'customerCompanyName' | 'productName' | 'salesPersonName',
) {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === 'string' && value ? value : undefined;
}

function SalesPersonCell({ quote }: { quote: QuoteSummary }) {
  if (!quote.salesPersonName) {
    return <span className="text-muted-foreground">Not assigned</span>;
  }

  return <span className="truncate">{quote.salesPersonName}</span>;
}

function getQuoteTotal(quote: QuoteSummary): number {
  // A stale selection is excluded from the total, matching the edit form's Effective Bill of
  // Materials. The list has no product catalog to resolve against, but the selection FK is
  // `on delete set null`, so a deleted catalog Optional Assembly leaves a null reference — which
  // is the complete stale set for persisted selections.
  const liveSelectedAssemblies = quote.selectedAssemblies.filter((assembly) => assembly.productAssemblyId !== null);

  return computeQuoteTotal({
    deliveryIncluded: quote.deliveryIncluded,
    deliveryPrice: quote.deliveryPrice,
    discountAmount: quote.discountAmount,
    quotedBasePrice: quote.quotedBasePrice,
    selectedAssemblyPrices: liveSelectedAssemblies.map((assembly) => assembly.quotedPrice),
  });
}
