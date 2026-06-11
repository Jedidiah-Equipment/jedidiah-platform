import { computeQuoteDiscountAmount, computeQuoteTotal, formatCurrency, formatPercent } from '@pkg/domain';
import { type PriorityQuote, QuoteStatus, type QuoteSummary } from '@pkg/schema';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { ColumnDef } from '@tanstack/react-table';

import { DateDisplay } from '@/components/common/DateDisplay.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { cn } from '@/lib/utils.js';

import { QuoteLinkedJobs } from './QuoteLinkedJobs.js';
import { QuoteStatusBadge, quoteStatusLabels } from './QuoteStatusBadge.js';

type FilterOption = {
  label: string;
  value: string;
};

export type QuoteTableRow =
  | {
      kind: 'normal';
      quote: QuoteSummary;
    }
  | {
      kind: 'priority';
      quote: PriorityQuote;
    };

export const quoteStatusFilterOptions = QuoteStatus.options.map((status) => ({
  label: quoteStatusLabels[status],
  value: status,
}));

export function createQuoteTableRow(quote: QuoteSummary): QuoteTableRow {
  return {
    kind: 'normal',
    quote,
  };
}

export function createPriorityQuoteTableRow(quote: PriorityQuote): QuoteTableRow {
  return {
    kind: 'priority',
    quote,
  };
}

export function getQuoteTableRowClassName(row: QuoteTableRow): string | undefined {
  return row.kind === 'priority'
    ? 'border-amber-300/70 bg-amber-50/95 text-amber-950 hover:bg-amber-100/85 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-950/45'
    : undefined;
}

export function createQuoteTableColumns({
  canOpenJobs,
  customerOptions,
  productOptions,
  salespersonOptions,
}: {
  canOpenJobs: boolean;
  customerOptions: FilterOption[];
  productOptions: FilterOption[];
  salespersonOptions: FilterOption[];
}): ColumnDef<QuoteTableRow>[] {
  return [
    {
      accessorFn: (row) => row.quote.code,
      cell: ({ row }) => <QuoteCodeCell row={row.original} />,
      enableColumnFilter: false,
      enableSorting: true,
      header: 'Quote',
      id: 'code',
      meta: {
        headerClassName: 'min-w-36',
      },
    },
    {
      accessorFn: (row) => row.quote.customerCompanyName,
      cell: ({ row }) => <CustomerCell quote={row.original.quote} />,
      enableColumnFilter: true,
      enableSorting: true,
      header: 'Customer',
      id: 'customerCompanyName',
      meta: {
        filterOptions: customerOptions,
        filterVariant: 'select',
        headerClassName: 'min-w-52',
      },
    },
    {
      accessorFn: (row) => row.quote.salesPersonName,
      cell: ({ row }) => <SalesPersonCell isPriority={row.original.kind === 'priority'} quote={row.original.quote} />,
      enableColumnFilter: true,
      enableSorting: true,
      header: 'Salesperson',
      id: 'salesPersonName',
      meta: {
        filterOptions: salespersonOptions,
        filterVariant: 'select',
        headerClassName: 'min-w-48',
      },
    },
    {
      accessorFn: (row) => row.quote.productName,
      cell: ({ row }) => <ProductCell isPriority={row.original.kind === 'priority'} quote={row.original.quote} />,
      enableColumnFilter: true,
      enableSorting: true,
      header: 'Product',
      id: 'productName',
      meta: {
        filterOptions: productOptions,
        filterVariant: 'select',
        headerClassName: 'min-w-60',
      },
    },
    {
      cell: ({ row }) => <CommercialCell isPriority={row.original.kind === 'priority'} quote={row.original.quote} />,
      enableColumnFilter: false,
      enableSorting: false,
      header: 'Total',
      id: 'total',
      meta: {
        cellClassName: 'text-right',
        headerClassName: 'min-w-36 text-right',
      },
    },
    {
      cell: ({ row }) => <TermsCell isPriority={row.original.kind === 'priority'} quote={row.original.quote} />,
      enableColumnFilter: false,
      enableSorting: false,
      header: 'Terms',
      id: 'terms',
      meta: {
        headerClassName: 'min-w-36',
      },
    },
    {
      accessorFn: (row) => row.quote.validUntil,
      cell: ({ row }) => <QuoteDatesCell row={row.original} />,
      enableColumnFilter: false,
      enableSorting: false,
      header: 'Dates',
      id: 'validUntil',
      meta: {
        headerClassName: 'min-w-44',
      },
    },
    {
      accessorFn: (row) => row.quote.status,
      cell: ({ row }) => <QuoteStatusBadge status={row.original.quote.status} />,
      enableColumnFilter: true,
      enableSorting: true,
      header: 'Status',
      id: 'status',
      meta: {
        filterOptions: quoteStatusFilterOptions,
        filterVariant: 'multi-select',
      },
    },
    {
      accessorFn: (row) => row.quote.linkedJobs,
      cell: ({ row }) =>
        row.original.kind === 'priority' ? (
          <PriorityQuoteJobCell />
        ) : (
          <QuoteLinkedJobs canOpenJobs={canOpenJobs} linkedJobs={row.original.quote.linkedJobs} />
        ),
      enableColumnFilter: false,
      enableSorting: false,
      header: 'Job',
      id: 'linkedJobs',
    },
  ];
}

function QuoteCodeCell({ row }: { row: QuoteTableRow }) {
  if (row.kind === 'priority') {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="inline-flex w-fit items-center gap-1 rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-normal text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100">
          <IconAlertTriangle aria-hidden className="size-3.5 shrink-0" />
          Job start needed
        </span>
        <span className="font-mono font-semibold tabular-nums">{row.quote.code}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono font-medium tabular-nums">{row.quote.code}</span>
      <span className="text-xs text-muted-foreground">
        Created <DateDisplay date={row.quote.createdAt} />
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

function SalesPersonCell({ isPriority, quote }: { isPriority: boolean; quote: QuoteSummary }) {
  if (!quote.salesPersonName) {
    return (
      <span className={cn(isPriority ? 'text-amber-900/70 dark:text-amber-100/65' : 'text-muted-foreground')}>
        Not assigned
      </span>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <EntityThumbnail label={quote.salesPersonName} size="sm" thumbnailDataUrl={quote.salesPersonThumbnailDataUrl} />
      <span className="truncate font-medium">{quote.salesPersonName}</span>
    </div>
  );
}

function ProductCell({ isPriority, quote }: { isPriority: boolean; quote: QuoteSummary }) {
  const selectedAssemblyCount = getLiveSelectedAssemblyCount(quote);

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-medium">{quote.productName}</span>
      <span
        className={cn(
          'truncate text-xs',
          isPriority ? 'text-amber-900/75 dark:text-amber-100/70' : 'text-muted-foreground',
        )}
      >
        <span className="font-mono">{quote.productModelCode}</span> / {quote.productBuildTimeDays}d build
        {selectedAssemblyCount > 0 ? ` / ${selectedAssemblyCount} option${selectedAssemblyCount === 1 ? '' : 's'}` : ''}
      </span>
    </div>
  );
}

function CommercialCell({ isPriority, quote }: { isPriority: boolean; quote: QuoteSummary }) {
  const liveSelectedAssemblies = getLiveSelectedAssemblies(quote);
  const discountAmount = computeQuoteDiscountAmount({
    discountPercent: quote.discountPercent,
    quotedBasePrice: quote.quotedBasePrice,
    selectedAssemblyPrices: liveSelectedAssemblies.map((assembly) => assembly.quotedPrice),
  });

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-medium tabular-nums">{formatCurrency(getQuoteTotal(quote), quote.quotedCurrencyCode)}</span>
      {discountAmount > 0 ? (
        <span
          className={cn('text-xs', isPriority ? 'text-amber-900/75 dark:text-amber-100/70' : 'text-muted-foreground')}
        >
          {formatCurrency(discountAmount, quote.quotedCurrencyCode)} ({formatPercent(quote.discountPercent)}) discount
        </span>
      ) : null}
    </div>
  );
}

function TermsCell({ isPriority, quote }: { isPriority: boolean; quote: QuoteSummary }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="tabular-nums">{formatPercent(quote.depositPercent)} deposit</span>
      <span
        className={cn('text-xs', isPriority ? 'text-amber-900/75 dark:text-amber-100/70' : 'text-muted-foreground')}
      >
        {quote.deliveryIncluded
          ? `${formatCurrency(quote.deliveryPrice, quote.quotedCurrencyCode)} delivery`
          : 'Delivery excluded'}
      </span>
    </div>
  );
}

function QuoteDatesCell({ row }: { row: QuoteTableRow }) {
  if (row.kind === 'priority') {
    return (
      <div className="flex flex-col gap-0.5">
        <PriorityQuoteDeliveryDateLine
          date={row.quote.preferredDeliveryDate}
          isEarliest={row.quote.preferredDeliveryDate === row.quote.earliestDeliveryDate}
          label="Preferred"
        />
        <PriorityQuoteDeliveryDateLine
          date={row.quote.plannedDeliveryDate}
          isEarliest={row.quote.plannedDeliveryDate === row.quote.earliestDeliveryDate}
          label="Planned"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span>
        Valid <DateDisplay date={row.quote.validUntil} emptyValue="Not set" />
      </span>
      <span className="text-xs text-muted-foreground">
        Preferred <DateDisplay date={row.quote.preferredDeliveryDate} emptyValue="not set" />
      </span>
    </div>
  );
}

function PriorityQuoteDeliveryDateLine({
  date,
  isEarliest,
  label,
}: {
  date: string | null;
  isEarliest: boolean;
  label: string;
}) {
  return (
    <span
      className={cn('text-xs text-amber-900/85 dark:text-amber-100/80', isEarliest ? 'font-semibold' : undefined)}
      data-priority-date={isEarliest ? 'earliest' : undefined}
    >
      {label}{' '}
      <DateDisplay
        className={cn(isEarliest ? 'text-sm text-amber-950 dark:text-amber-50' : undefined)}
        date={date}
        emptyValue="not set"
      />
    </span>
  );
}

function PriorityQuoteJobCell() {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-semibold text-amber-950 dark:text-amber-50">No job</span>
      <span className="text-xs text-amber-900/80 dark:text-amber-100/75">Quote needs a Job started</span>
    </div>
  );
}

function getQuoteTotal(quote: QuoteSummary): number {
  // A stale selection is excluded from the total, matching the edit form's Effective Bill of
  // Materials. The list has no product catalog to resolve against, but the selection FK is
  // `on delete set null`, so a deleted catalog Optional Assembly leaves a null reference - which
  // is the complete stale set for persisted selections.
  const liveSelectedAssemblies = getLiveSelectedAssemblies(quote);

  return computeQuoteTotal({
    deliveryIncluded: quote.deliveryIncluded,
    deliveryPrice: quote.deliveryPrice,
    discountPercent: quote.discountPercent,
    quotedBasePrice: quote.quotedBasePrice,
    selectedAssemblyPrices: liveSelectedAssemblies.map((assembly) => assembly.quotedPrice),
  });
}

function getLiveSelectedAssemblyCount(quote: QuoteSummary): number {
  return getLiveSelectedAssemblies(quote).length;
}

function getLiveSelectedAssemblies(quote: QuoteSummary): QuoteSummary['selectedAssemblies'] {
  return quote.selectedAssemblies.filter((assembly) => assembly.productAssemblyId !== null);
}
