import { formatCurrency, formatPercent, getQuoteOfferingName, getQuoteOfferingSubtitle, priceQuote } from '@pkg/domain';
import { type PriorityQuote, QuoteKind, QuoteStatus, type QuoteSummary } from '@pkg/schema';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { ColumnDef } from '@tanstack/react-table';

import { DateDisplay } from '@/components/common/DateDisplay.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

import { QuoteLinkedJob } from './QuoteLinkedJob.js';
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

export const quoteKindLabels = {
  custom: 'Custom',
  product: 'Product',
} as const satisfies Record<QuoteSummary['kind'], string>;

export const quoteKindFilterOptions = QuoteKind.options.map((kind) => ({
  label: quoteKindLabels[kind],
  value: kind,
}));

export const quoteTablePinnedLeftColumns = ['code'];
export const quoteTablePinnedRightColumns = ['status', 'job'];

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
    ? 'border-warning/40 text-warning-foreground dark:border-warning/35 [--table-row-bg:var(--warning-surface)] [--table-row-bg-hover:var(--warning-surface-hover)]'
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
      accessorFn: (row) => row.quote.kind,
      cell: ({ row }) => <QuoteKindBadge kind={row.original.quote.kind} />,
      enableColumnFilter: true,
      enableSorting: false,
      header: 'Kind',
      id: 'kind',
      meta: {
        filterOptions: quoteKindFilterOptions,
        filterVariant: 'select',
        headerClassName: 'min-w-28',
      },
      size: 112,
    },
    {
      accessorFn: (row) => row.quote.customerCompanyName,
      cell: ({ row }) => <CustomerCell quote={row.original.quote} />,
      enableColumnFilter: true,
      enableSorting: true,
      header: 'Customer',
      id: 'customerCompanyName',
      meta: {
        cellClassName: 'max-w-44 overflow-hidden',
        filterOptions: customerOptions,
        filterVariant: 'select',
        headerClassName: 'min-w-40 max-w-44',
      },
      size: 176,
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
      accessorFn: (row) => getQuoteOfferingName(row.quote),
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
      accessorFn: (row) => row.quote.status,
      cell: ({ row }) => <QuoteStatusBadge status={row.original.quote.status} />,
      enableColumnFilter: true,
      enableSorting: true,
      header: 'Status',
      id: 'status',
      meta: {
        filterOptions: quoteStatusFilterOptions,
        filterVariant: 'multi-select',
        headerClassName: 'min-w-32',
      },
      size: 128,
    },
    {
      accessorFn: (row) => row.quote.job,
      cell: ({ row }) =>
        row.original.kind === 'priority' ? (
          <PriorityQuoteJobCell />
        ) : (
          <QuoteLinkedJob canOpenJobs={canOpenJobs} job={row.original.quote.job} />
        ),
      enableColumnFilter: false,
      enableSorting: false,
      header: 'Job',
      id: 'job',
      meta: {
        cellClassName: 'max-w-36 overflow-hidden',
        headerClassName: 'min-w-36',
      },
      size: 144,
    },
  ];
}

function QuoteCodeCell({ row }: { row: QuoteTableRow }) {
  if (row.kind === 'priority') {
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="font-mono font-semibold tabular-nums">{row.quote.code}</span>
          <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded border border-warning/45 bg-warning/15 px-1.5 text-[11px] font-semibold uppercase leading-4 tracking-normal text-warning-foreground">
            <IconAlertTriangle aria-hidden className="size-3.5 shrink-0" />
            Needs job
          </span>
        </div>
        <span className="text-xs text-warning-foreground/75">
          Created <DateDisplay date={row.quote.createdAt} />
        </span>
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
      <span className={cn(isPriority ? 'text-warning-foreground/75' : 'text-muted-foreground')}>Not assigned</span>
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
  const offeringName = getQuoteOfferingName(quote);
  const offeringSubtitle = getQuoteOfferingSubtitle(quote);

  if (quote.kind === 'custom') {
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{offeringName}</span>
          <QuoteKindBadge className="shrink-0" kind={quote.kind} />
        </span>
        <span className={cn('truncate text-xs', isPriority ? 'text-warning-foreground/75' : 'text-muted-foreground')}>
          {offeringSubtitle?.text}
        </span>
      </div>
    );
  }

  const selectedAssemblyCount = getLiveSelectedAssemblyCount(quote);

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-medium">{offeringName}</span>
      <span className={cn('truncate text-xs', isPriority ? 'text-warning-foreground/75' : 'text-muted-foreground')}>
        {offeringSubtitle?.text}
        {selectedAssemblyCount > 0 ? ` / ${selectedAssemblyCount} option${selectedAssemblyCount === 1 ? '' : 's'}` : ''}
      </span>
    </div>
  );
}

function QuoteKindBadge({ className, kind }: { className?: string; kind: QuoteSummary['kind'] }) {
  return (
    <Badge className={className} variant="outline">
      {quoteKindLabels[kind]}
    </Badge>
  );
}

function CommercialCell({ isPriority, quote }: { isPriority: boolean; quote: QuoteSummary }) {
  const { discountAmount, total } = priceQuote(quote);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-medium tabular-nums">{formatCurrency(total, quote.quotedCurrencyCode)}</span>
      {discountAmount > 0 ? (
        <span className={cn('text-xs', isPriority ? 'text-warning-foreground/75' : 'text-muted-foreground')}>
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
      <span className={cn('text-xs', isPriority ? 'text-warning-foreground/75' : 'text-muted-foreground')}>
        {quote.deliveryIncluded
          ? `${formatCurrency(quote.deliveryPrice, quote.quotedCurrencyCode)} delivery`
          : 'Delivery excluded'}
      </span>
    </div>
  );
}

function QuoteDatesCell({ row }: { row: QuoteTableRow }) {
  const isPriority = row.kind === 'priority';
  // Only priority quotes carry the resolved earliest date used to highlight the binding line.
  const earliestDeliveryDate = row.kind === 'priority' ? row.quote.earliestDeliveryDate : null;

  return (
    <div className="flex flex-col gap-0.5">
      <QuoteDeliveryDateLine
        date={row.quote.preferredDeliveryDate}
        isEarliest={earliestDeliveryDate !== null && row.quote.preferredDeliveryDate === earliestDeliveryDate}
        isPriority={isPriority}
        label="Preferred"
      />
      <QuoteDeliveryDateLine
        date={row.quote.plannedDeliveryDate}
        isEarliest={earliestDeliveryDate !== null && row.quote.plannedDeliveryDate === earliestDeliveryDate}
        isPriority={isPriority}
        label="Planned"
      />
    </div>
  );
}

function QuoteDeliveryDateLine({
  date,
  isEarliest,
  isPriority,
  label,
}: {
  date: string | null;
  isEarliest: boolean;
  isPriority: boolean;
  label: string;
}) {
  const isHighlighted = isPriority && isEarliest;

  return (
    <span
      className={cn(
        'text-xs',
        isPriority ? 'text-warning-foreground/85' : 'text-muted-foreground',
        isHighlighted ? 'font-semibold' : undefined,
      )}
      data-priority-date={isPriority && isEarliest ? 'earliest' : undefined}
    >
      {label}{' '}
      <DateDisplay
        className={cn(isHighlighted ? 'text-sm text-warning-foreground' : 'text-foreground')}
        date={date}
        emptyValue="not set"
      />
    </span>
  );
}

function PriorityQuoteJobCell() {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <IconAlertTriangle aria-hidden className="size-4 shrink-0 text-warning-foreground" />
      <span className="font-semibold text-warning-foreground">No job</span>
    </div>
  );
}

function getLiveSelectedAssemblyCount(quote: QuoteSummary): number {
  return getLiveSelectedAssemblies(quote).length;
}

function getLiveSelectedAssemblies(quote: QuoteSummary): QuoteSummary['selectedAssemblies'] {
  return quote.selectedAssemblies.filter((assembly) => assembly.productAssemblyId !== null);
}
