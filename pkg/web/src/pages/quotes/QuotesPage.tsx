import { hasPermission } from '@pkg/domain';
import { QuoteKind, type QuoteListInput, QuoteSortBy, QuoteStatus, type QuoteSummary, type UUID } from '@pkg/schema';
import { IconPlus } from '@tabler/icons-react';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
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

export const useQuoteTableStore = createQuoteTableStore('quotes-table');

const useCustomerQuoteTableStore = createQuoteTableStore('customer-quotes-table');

function createQuoteTableStore(persistName: string) {
  return createPersistedDataTableStore({
    initialState: {
      sorting: [
        {
          desc: true,
          id: 'createdAt',
        },
      ],
    },
    persistName,
    persistVersion: 4,
  });
}

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

export const QuoteTable: React.FC<{ customerId?: UUID }> = ({ customerId }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const accessQuery = useAccess();
  const canOpenJobs = hasPermission(accessQuery.data, 'job:read') || hasPermission(accessQuery.data, 'job:update');
  const canUpdateQuote = hasPermission(accessQuery.data, 'quote:update');
  const customerOptions = useCustomerForQuoteOptions({ limit: 0 });
  const salespersonOptions = useSalesPersonOptions();

  const getListInputExtras = useCallback(
    (columnFilters: ColumnFiltersState) => getQuoteListInputExtras(columnFilters, customerId),
    [customerId],
  );
  const tableController = useServerSideTableController({
    store: customerId ? useCustomerQuoteTableStore : useQuoteTableStore,
    sortOptions: quoteSortOptions,
    getListInputExtras,
  });
  const productFilterValue = getIdFilterValue(tableController.columnFilters, 'productName');
  const productOptions = useProductForQuoteOptions({
    includeHistoricalSelected: true,
    limit: 0,
    value: productFilterValue ?? '',
  });

  const quotesQuery = useInfiniteQuery(
    trpc.quotes.list.infiniteQueryOptions(tableController.listInput, {
      ...cursorInfiniteQueryOptions,
      placeholderData: keepPreviousData,
    }),
  );
  const priorityQuotesQuery = useQuery(trpc.quotes.priorityList.queryOptions(customerId ? { customerId } : {}));
  const { items: quotes, total } = useCombinedCursorQueryPages(quotesQuery.data?.pages);
  const priorityQuotes = priorityQuotesQuery.data ?? [];
  const normalQuoteRows = useMemo(() => quotes.map(createQuoteTableRow), [quotes]);
  const priorityQuoteRows = useMemo(() => priorityQuotes.map(createPriorityQuoteTableRow), [priorityQuotes]);
  const tableRows = useMemo(() => [...priorityQuoteRows, ...normalQuoteRows], [normalQuoteRows, priorityQuoteRows]);

  const columns = useMemo(
    () =>
      createQuoteTableColumns({
        canOpenJobs,
        customerOptions: customerOptions.selectOptions,
        productOptions: productOptions.selectOptions,
        salespersonOptions: salespersonOptions.selectOptions,
        showCustomerColumn: !customerId,
      }),
    [
      canOpenJobs,
      customerId,
      customerOptions.selectOptions,
      productOptions.selectOptions,
      salespersonOptions.selectOptions,
    ],
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
    manualSorting: true,
    onColumnFiltersChange: tableController.setColumnFilters,
    onGlobalFilterChange: tableController.setGlobalFilter,
    onSortingChange: tableController.setSorting,
    state: {
      columnFilters: tableController.columnFilters,
      globalFilter: tableController.globalFilter,
      sorting: tableController.sorting,
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
      isLoading={quotesQuery.isPending}
      loadMore={{
        hasNextPage: quotesQuery.hasNextPage,
        isFetchingNextPage: quotesQuery.isFetchingNextPage,
        loadedCount: quotes.length,
        onLoadMore: () => void quotesQuery.fetchNextPage(),
      }}
      onRowClick={quoteRowClick}
      tableClassName={customerId ? 'min-w-[1084px]' : 'min-w-[1260px]'}
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

function getQuoteListInputExtras(columnFilters: ColumnFiltersState, customerId?: UUID) {
  return {
    filters: {
      customerId: customerId ?? getIdFilterValue(columnFilters, 'customerCompanyName'),
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
