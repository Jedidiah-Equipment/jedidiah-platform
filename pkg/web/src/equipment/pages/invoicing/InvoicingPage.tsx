import { countPhrase, formatCurrency, formatDate } from '@pkg/domain';
import {
  pricePersistedQuote,
  quoteOfferingType,
  quoteStageColorClassNames,
  quoteStageLabels,
} from '@pkg/domain/equipment';
import {
  invoicingQuoteStages,
  openInvoicingQuoteStages,
  type QuoteListInput,
  type QuoteSummary,
} from '@pkg/schema/equipment';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { StatusQuickFilters } from '@/components/data-table/StatusQuickFilters.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { invoicingPageDescription } from '@/equipment/utils/page-descriptions.js';
import { useCan } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { QuoteOfferingTypeBadge } from '../quotes/components/QuoteOfferingTypeBadge.js';
import { QuoteStageBadge } from '../quotes/components/QuoteStageBadge.js';
import { QuoteStampInvoiceDialog, type StampableQuote } from '../quotes/components/QuoteStampInvoiceDialog.js';
import { quoteOfferingTypeFilterOptions } from '../quotes/components/QuoteTableColumns.js';
import {
  focusOnInvoicingStage,
  INVOICED_COLUMN_ID,
  type InvoicingQuoteStage,
  invoicingListFilters,
  JOB_COMPLETED_COLUMN_ID,
  STAGE_COLUMN_ID,
  TYPE_COLUMN_ID,
} from './types.js';

const defaultSort = { id: JOB_COMPLETED_COLUMN_ID, desc: false } as const;

const useInvoicingTableStore = createPersistedDataTableStore({
  initialState: { sorting: [defaultSort] },
  persistName: 'equipment-invoicing-table',
});

/** Writes the Dashboard's stage into the saved filters, once; the persisted filters own it from then on. */
export function focusInvoicingOn(stage: InvoicingQuoteStage) {
  useInvoicingTableStore.getState().setColumnFilters(focusOnInvoicingStage(stage));
}

const invoicingSortOptions: SortOptions<QuoteListInput> = {
  allowedSortIds: ['code', JOB_COMPLETED_COLUMN_ID, INVOICED_COLUMN_ID],
  defaultSort,
};

const stageFilterOptions = invoicingQuoteStages.map((stage) => ({ value: stage, label: quoteStageLabels[stage] }));

const totalExVat = (quote: QuoteSummary) => pricePersistedQuote(quote).subtotal;

export function InvoicingPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const canStamp = useCan('equipment_invoice:update').can;
  const [stamping, setStamping] = useState<StampableQuote | null>(null);
  const stageCounts = useQuery(trpc.quotes.stageCounts.queryOptions());
  const counts = stageCounts.data?.counts;
  // The default stages depend on what is open, so the list waits for the counts rather than guess.
  const getListInputExtras = useCallback(
    (columnFilters: ColumnFiltersState) => invoicingListFilters(columnFilters, counts),
    [counts],
  );
  const tableController = useServerSideTableController({
    store: useInvoicingTableStore,
    sortOptions: invoicingSortOptions,
    getListInputExtras,
  });
  const quotesQuery = useInfiniteQuery(
    trpc.quotes.list.infiniteQueryOptions(tableController.listInput, {
      ...cursorInfiniteQueryOptions,
      enabled: stageCounts.isSuccess,
      placeholderData: keepPreviousData,
    }),
  );
  const { items: quotes, total } = useCombinedCursorQueryPages(quotesQuery.data?.pages);
  const columns = useMemo<DataTableColumnDef<QuoteSummary>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Quote',
        enableColumnFilter: false,
        enableSorting: true,
        cell: ({ row }) => <span className="font-mono font-medium tabular-nums">{row.original.code}</span>,
      },
      {
        accessorKey: 'customerCompanyName',
        header: 'Customer',
        enableColumnFilter: false,
        enableSorting: false,
      },
      {
        id: TYPE_COLUMN_ID,
        accessorFn: quoteOfferingType,
        header: 'Type',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: quoteOfferingTypeFilterOptions, filterVariant: 'select', headerClassName: 'min-w-28' },
        cell: ({ row }) => <QuoteOfferingTypeBadge quote={row.original} />,
      },
      {
        accessorKey: JOB_COMPLETED_COLUMN_ID,
        header: 'Job completed',
        enableColumnFilter: false,
        enableSorting: true,
        cell: ({ row }) => formatDate(row.original.jobCompletedOn, 'short', '—'),
      },
      {
        id: 'total',
        header: 'Total ex VAT',
        enableColumnFilter: false,
        enableSorting: false,
        meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
        cell: ({ row }) => formatCurrency(totalExVat(row.original), row.original.quotedCurrencyCode),
      },
      {
        id: STAGE_COLUMN_ID,
        accessorKey: 'stage',
        header: 'Stage',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: stageFilterOptions, filterVariant: 'multi-select', headerClassName: 'min-w-36' },
        cell: ({ row }) => <QuoteStageBadge stage={row.original.stage} />,
      },
      {
        id: 'invoice-number',
        header: 'Invoice №',
        enableColumnFilter: false,
        enableSorting: false,
        cell: ({ row }) => {
          const quote = row.original;
          if (quote.invoiceNumber) return <span className="font-mono">{quote.invoiceNumber}</span>;
          return canStamp && quote.stage === 'awaiting-invoice' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                setStamping({ ...quote, totalExVat: totalExVat(quote) });
              }}
            >
              Stamp
            </Button>
          ) : null;
        },
      },
      {
        accessorKey: INVOICED_COLUMN_ID,
        header: 'Invoiced',
        enableColumnFilter: true,
        enableSorting: true,
        meta: { filterVariant: 'date-range', headerClassName: 'min-w-36' },
        cell: ({ row }) => formatDate(row.original.invoicedAt, 'short', '—'),
      },
    ],
    [canStamp],
  );
  const table = useDataTable({
    columns,
    data: quotes,
    enableSortingRemoval: false,
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
  return (
    <PageLayout title="Invoicing" description={invoicingPageDescription} size="full">
      <StatusQuickFilters
        label="Invoicing stages"
        columnId={STAGE_COLUMN_ID}
        statuses={invoicingQuoteStages}
        shown={openInvoicingQuoteStages}
        labels={quoteStageLabels}
        colours={quoteStageColorClassNames}
        counts={counts}
        columnFilters={tableController.columnFilters}
        onColumnFiltersChange={tableController.setColumnFilters}
      />
      <DataTable
        emptyMessage="No Quotes found."
        errorMessage={
          getApiQueryErrorMessage(quotesQuery.error, 'Unable to load Invoicing.') ??
          getApiQueryErrorMessage(stageCounts.error, 'Unable to load Invoicing counts.')
        }
        getRowAriaLabel={(quote) => `Open ${quote.code}`}
        globalFilterPlaceholder="Search Quotes…"
        isLoading={quotesQuery.isPending}
        paginationMode="cursor"
        loadMore={{
          hasNextPage: quotesQuery.hasNextPage,
          isFetchingNextPage: quotesQuery.isFetchingNextPage,
          loadedCount: quotes.length,
          onLoadMore: () => void quotesQuery.fetchNextPage(),
        }}
        onRowClick={(quote) => void navigate({ to: '/equipment/quotes/$id/edit', params: { id: quote.id } })}
        table={table}
        total={total}
        totalLabel={(value) => countPhrase(value, 'Quote', 'Quotes')}
      />
      {stamping ? (
        <QuoteStampInvoiceDialog
          quote={stamping}
          open
          onOpenChange={(open) => {
            if (!open) setStamping(null);
          }}
        />
      ) : null}
    </PageLayout>
  );
}
