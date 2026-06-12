import { formatCurrency, hasPermission } from '@pkg/domain';
import type { StaleSentQuote } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';

const STALE_SENT_SKELETON_ROWS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

export const StaleSentQuotesWidget: React.FC = () => {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const staleSentQuery = useQuery(trpc.quotes.staleSent.queryOptions());
  const canUpdateQuote = hasPermission(accessQuery.data, 'quote:update');
  const staleQuotes = staleSentQuery.data?.items ?? [];

  if (staleSentQuery.error) {
    return <DashboardWidgetError error={staleSentQuery.error} fallbackMessage="Unable to load stale sent quotes." />;
  }

  if (staleSentQuery.isPending) {
    return <StaleSentQuotesWidgetSkeleton />;
  }

  if (staleQuotes.length === 0) {
    return <DashboardWidgetEmpty>No sent quotes awaiting a response.</DashboardWidgetEmpty>;
  }

  return (
    <ul className="flex flex-col divide-y">
      {staleQuotes.map((quote) => (
        <li key={quote.id}>
          <StaleSentQuoteRow canUpdateQuote={canUpdateQuote} quote={quote} />
        </li>
      ))}
    </ul>
  );
};

function StaleSentQuoteRow({ canUpdateQuote, quote }: { canUpdateQuote: boolean; quote: StaleSentQuote }) {
  const content = <StaleSentQuoteRowContent canUpdateQuote={canUpdateQuote} quote={quote} />;
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

function StaleSentQuoteRowContent({ canUpdateQuote, quote }: { canUpdateQuote: boolean; quote: StaleSentQuote }) {
  return (
    <>
      <span className="min-w-0">
        <span className={`block truncate font-medium text-foreground ${canUpdateQuote ? 'group-hover:underline' : ''}`}>
          {quote.customerCompanyName}
        </span>
        <span className="block truncate text-muted-foreground">{quote.code}</span>
      </span>
      <span className="text-right">
        <span className="block font-medium tabular-nums">{formatCurrency(quote.totalValue, quote.currencyCode)}</span>
        <span className="block text-muted-foreground text-xs">{formatSentDaysAgo(quote.sentDaysAgo)}</span>
      </span>
    </>
  );
}

function StaleSentQuotesWidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {STALE_SENT_SKELETON_ROWS.map((row) => (
        <div key={row} className="grid grid-cols-[1fr_auto] gap-4">
          <span className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </span>
          <span className="flex flex-col items-end gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-24" />
          </span>
        </div>
      ))}
    </div>
  );
}

function formatSentDaysAgo(sentDaysAgo: number): string {
  if (sentDaysAgo === 0) {
    return 'sent today';
  }

  return sentDaysAgo === 1 ? 'sent 1 day ago' : `sent ${sentDaysAgo} days ago`;
}
