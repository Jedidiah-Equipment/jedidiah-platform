import { computeQuoteTotal, formatCurrency, formatPercent, hasPermission } from '@pkg/domain';
import { type QuoteListInput, QuoteSortBy, QuoteStatus, type QuoteSummary } from '@pkg/schema';
import { IconPlus } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ColumnDef, type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type React from 'react';
import { useMemo, useState } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useConstrainedTableState } from '@/components/data-table/hooks/use-constrained-table-state.js';
import { usePagedQueryResult } from '@/components/data-table/hooks/use-paged-query-result.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Button } from '@/components/ui/button.js';
import { useCustomerForQuoteOptions, useProductForQuoteOptions, useSalesPersonOptions } from '@/hooks/options/index.js';
import { useAccess } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
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
            <IconPlus data-icon="inline-start" />
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
  const navigate = useNavigate();
  const accessQuery = useAccess();
  const canOpenJobs = hasPermission(accessQuery.data, 'job:read') || hasPermission(accessQuery.data, 'job:update');
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
        accessorKey: 'code',
        cell: ({ row }) => <QuoteCodeCell quote={row.original} />,
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Quote',
        meta: {
          headerClassName: 'min-w-36',
        },
      },
      {
        accessorKey: 'customerCompanyName',
        cell: ({ row }) => <CustomerCell quote={row.original} />,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Customer',
        meta: {
          filterOptions: customerOptions.selectOptions,
          filterVariant: 'select',
          headerClassName: 'min-w-52',
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
          headerClassName: 'min-w-48',
        },
      },
      {
        accessorKey: 'productName',
        cell: ({ row }) => <ProductCell quote={row.original} />,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Product',
        meta: {
          filterOptions: productOptions.selectOptions,
          filterVariant: 'select',
          headerClassName: 'min-w-60',
        },
      },
      {
        id: 'total',
        cell: ({ row }) => <CommercialCell quote={row.original} />,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Total',
        meta: {
          cellClassName: 'text-right',
          headerClassName: 'min-w-36 text-right',
        },
      },
      {
        id: 'terms',
        cell: ({ row }) => <TermsCell quote={row.original} />,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Terms',
        meta: {
          headerClassName: 'min-w-36',
        },
      },
      {
        accessorKey: 'validUntil',
        cell: ({ row }) => <QuoteDatesCell quote={row.original} />,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Dates',
        meta: {
          headerClassName: 'min-w-44',
        },
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
    ],
    [canOpenJobs, customerOptions.selectOptions, productOptions.selectOptions, salespersonOptions.selectOptions],
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
      getRowAriaLabel={canUpdateQuote ? (quote) => `Edit quote ${quote.code}` : undefined}
      globalFilterPlaceholder="Search quotes..."
      isLoading={isLoading}
      onRowClick={
        canUpdateQuote ? (quote) => navigate({ params: { id: quote.id }, to: '/quotes/$id/edit' }) : undefined
      }
      tableClassName="min-w-[1180px]"
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

function QuoteCodeCell({ quote }: { quote: QuoteSummary }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium tabular-nums">{quote.code}</span>
      <span className="text-xs text-muted-foreground">
        Created <DateDisplay date={quote.createdAt} />
      </span>
    </div>
  );
}

function CustomerCell({ quote }: { quote: QuoteSummary }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <EntityThumbnail label={quote.customerCompanyName} size="sm" thumbnailDataUrl={quote.customerThumbnailDataUrl} />
      <span className="min-w-0 truncate font-medium">{quote.customerCompanyName}</span>
    </div>
  );
}

function SalesPersonCell({ quote }: { quote: QuoteSummary }) {
  if (!quote.salesPersonName) {
    return <span className="text-muted-foreground">Not assigned</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <EntityThumbnail label={quote.salesPersonName} size="sm" thumbnailDataUrl={quote.salesPersonThumbnailDataUrl} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium">{quote.salesPersonName}</span>
        {quote.salesPersonEmail ? (
          <span className="truncate text-xs text-muted-foreground">{quote.salesPersonEmail}</span>
        ) : null}
      </span>
    </div>
  );
}

function ProductCell({ quote }: { quote: QuoteSummary }) {
  const selectedAssemblyCount = getLiveSelectedAssemblyCount(quote);

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-medium">{quote.productName}</span>
      <span className="truncate text-xs text-muted-foreground">
        {quote.productModelCode} / {quote.productBuildTimeDays}d build
        {selectedAssemblyCount > 0 ? ` / ${selectedAssemblyCount} option${selectedAssemblyCount === 1 ? '' : 's'}` : ''}
      </span>
    </div>
  );
}

function CommercialCell({ quote }: { quote: QuoteSummary }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-medium tabular-nums">{formatCurrency(getQuoteTotal(quote), quote.quotedCurrencyCode)}</span>
      {quote.discountAmount > 0 ? (
        <span className="text-xs text-muted-foreground">
          {formatCurrency(quote.discountAmount, quote.quotedCurrencyCode)} discount
        </span>
      ) : null}
    </div>
  );
}

function TermsCell({ quote }: { quote: QuoteSummary }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="tabular-nums">{formatPercent(quote.depositPercent)} deposit</span>
      <span className="text-xs text-muted-foreground">
        {quote.deliveryIncluded
          ? `${formatCurrency(quote.deliveryPrice, quote.quotedCurrencyCode)} delivery`
          : 'Delivery excluded'}
      </span>
    </div>
  );
}

function QuoteDatesCell({ quote }: { quote: QuoteSummary }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span>
        Valid <DateDisplay date={quote.validUntil} emptyValue="Not set" />
      </span>
      <span className="text-xs text-muted-foreground">
        Preferred <DateDisplay date={quote.preferredDeliveryDate} emptyValue="not set" />
      </span>
    </div>
  );
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

function getLiveSelectedAssemblyCount(quote: QuoteSummary): number {
  return quote.selectedAssemblies.filter((assembly) => assembly.productAssemblyId !== null).length;
}
