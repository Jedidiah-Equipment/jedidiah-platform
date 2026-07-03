import { formatCurrency, hasPermission, priceQuote } from '@pkg/domain';
import type { QuoteListInput, QuoteSummary } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { DateDisplay } from '@/components/common/DateDisplay.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';

const RECENT_QUOTES_LIST_INPUT = {
  filters: {
    statuses: [],
  },
  page: 1,
  pageSize: 5,
  search: '',
  sortBy: 'createdAt',
  sortDirection: 'desc',
} as const satisfies QuoteListInput;

const RECENT_QUOTES_SKELETON_ROWS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

export const RecentQuotesWidget: React.FC = () => {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const quotesQuery = useQuery(trpc.quotes.list.queryOptions(RECENT_QUOTES_LIST_INPUT));
  const canUpdateQuote = hasPermission(accessQuery.data, 'quote:update');
  const quotes = quotesQuery.data?.items ?? [];

  if (quotesQuery.error) {
    return <DashboardWidgetError error={quotesQuery.error} fallbackMessage="Unable to load recent quotes." />;
  }

  if (quotesQuery.isPending) {
    return <RecentQuotesWidgetSkeleton />;
  }

  if (quotes.length === 0) {
    return <DashboardWidgetEmpty>No quotes yet.</DashboardWidgetEmpty>;
  }

  return (
    <ul className="flex flex-col divide-y">
      {quotes.map((quote) => (
        <li key={quote.id}>
          <RecentQuoteRow canUpdateQuote={canUpdateQuote} quote={quote} />
        </li>
      ))}
    </ul>
  );
};

function RecentQuoteRow({ canUpdateQuote, quote }: { canUpdateQuote: boolean; quote: QuoteSummary }) {
  const content = <RecentQuoteRowContent canUpdateQuote={canUpdateQuote} quote={quote} />;
  const className = 'group grid min-w-0 grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3 text-sm first:pt-0 last:pb-0';

  if (!canUpdateQuote) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link className={className} params={{ id: quote.id }} to="/quotes/$id/edit">
      {content}
    </Link>
  );
}

function RecentQuoteRowContent({ canUpdateQuote, quote }: { canUpdateQuote: boolean; quote: QuoteSummary }) {
  const productName = quote.productName ?? '—';

  return (
    <>
      <span className="min-w-0">
        <span className={`block truncate font-medium text-foreground ${canUpdateQuote ? 'group-hover:underline' : ''}`}>
          {quote.code}
        </span>
        <span className="block truncate text-muted-foreground">
          {quote.customerCompanyName} / {productName}
        </span>
      </span>
      <span className="text-right">
        <span className="block font-medium tabular-nums">
          {formatCurrency(priceQuote(quote).total, quote.quotedCurrencyCode)}
        </span>
        <span className="block text-muted-foreground text-xs">
          <DateDisplay date={quote.createdAt} />
        </span>
      </span>
    </>
  );
}

function RecentQuotesWidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {RECENT_QUOTES_SKELETON_ROWS.map((row) => (
        <div key={row} className="grid grid-cols-[1fr_auto] gap-4">
          <span className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </span>
          <span className="flex flex-col items-end gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-16" />
          </span>
        </div>
      ))}
    </div>
  );
}
