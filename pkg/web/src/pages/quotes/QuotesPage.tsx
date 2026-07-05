import { hasPermission } from '@pkg/domain';
import { QuoteKind, type QuoteListInput, QuoteSortBy, QuoteStatus, type QuoteSummary } from '@pkg/schema';
import { IconPlus } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type React from 'react';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useConstrainedTableState } from '@/components/data-table/hooks/use-constrained-table-state.js';
import { usePagedQueryResult } from '@/components/data-table/hooks/use-paged-query-result.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useCustomerForQuoteOptions, useProductForQuoteOptions, useSalesPersonOptions } from '@/hooks/options/index.js';
import { useAccess } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { quotesPageDescription } from '@/utils/page-descriptions.js';
import {
  createPriorityQuoteTableRow,
  createQuoteTableColumns,
  createQuoteTableRow,
  getQuoteTableRowClassName,
  type QuoteTableRow,
  quoteTablePinnedLeftColumns,
  quoteTablePinnedRightColumns,
} from './components/QuoteTableColumns.js';
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

export const QuotesPage: React.FC = () => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <>
      <PageLayout
        actions={
          <Button onClick={() => setIsCreateOpen(true)} type="button">
            <IconPlus data-icon="inline-start" />
            New quote
          </Button>
        }
        description={quotesPageDescription}
        size="full"
        title="Quotes"
      >
        <QuoteTable />
      </PageLayout>
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
  const priorityQuotesQuery = useQuery(trpc.quotes.priorityList.queryOptions());
  const { items: quotes, total, isLoading } = usePagedQueryResult(quotesQuery);
  const priorityQuotes = priorityQuotesQuery.data ?? [];
  const normalQuoteRows = useMemo(() => quotes.map(createQuoteTableRow), [quotes]);
  const priorityQuoteRows = useMemo(() => priorityQuotes.map(createPriorityQuoteTableRow), [priorityQuotes]);
  const tableRows = useMemo(() => [...priorityQuoteRows, ...normalQuoteRows], [normalQuoteRows, priorityQuoteRows]);

  const tableState = useConstrainedTableState({
    pagination: tableController.pagination,
    setPageIndex: tableController.setPageIndex,
    sorting: tableController.sorting,
    sortOptions: quoteSortOptions,
    total,
  });

  const columns = useMemo(
    () =>
      createQuoteTableColumns({
        canOpenJobs,
        customerOptions: customerOptions.selectOptions,
        productOptions: productOptions.selectOptions,
        salespersonOptions: salespersonOptions.selectOptions,
      }),
    [canOpenJobs, customerOptions.selectOptions, productOptions.selectOptions, salespersonOptions.selectOptions],
  );

  const table = useReactTable({
    columns,
    data: tableRows,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    initialState: {
      columnPinning: {
        left: quoteTablePinnedLeftColumns,
        right: quoteTablePinnedRightColumns,
      },
    },
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

  const handleQuoteClick = (row: QuoteTableRow) => navigate({ params: { id: row.quote.id }, to: '/quotes/$id/edit' });
  const quoteRowClick = canUpdateQuote ? handleQuoteClick : undefined;
  const errorMessage =
    getApiQueryErrorMessage(quotesQuery.error, 'Unable to load quotes.') ??
    getApiQueryErrorMessage(priorityQuotesQuery.error, 'Unable to load priority quotes.');

  return (
    <DataTable
      emptyMessage="No quotes found."
      errorMessage={errorMessage}
      getRowAriaLabel={
        canUpdateQuote
          ? (row) => `${row.kind === 'priority' ? 'Edit priority quote' : 'Edit quote'} ${row.quote.code}`
          : undefined
      }
      getRowClassName={getQuoteTableRowClassName}
      globalFilterPlaceholder="Search quotes..."
      isLoading={isLoading}
      onRowClick={quoteRowClick}
      tableClassName="min-w-[1260px]"
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

function getKindFilterValue(columnFilters: ColumnFiltersState) {
  const value = columnFilters.find((filter) => filter.id === 'kind')?.value;
  const parsed = typeof value === 'string' ? QuoteKind.safeParse(value) : null;

  return parsed?.success ? parsed.data : undefined;
}

function getQuoteListInputExtras(columnFilters: ColumnFiltersState) {
  return {
    filters: {
      customerId: getIdFilterValue(columnFilters, 'customerCompanyName'),
      kind: getKindFilterValue(columnFilters),
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
