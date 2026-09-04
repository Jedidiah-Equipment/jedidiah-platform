import { formatCurrency } from '@pkg/domain';
import type { StaleSentQuote } from '@pkg/schema/equipment';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

import { DashboardList, DashboardListItem, DashboardListScrollArea } from '../DashboardList.js';
import { DashboardQuoteIdentity } from '../DashboardQuoteIdentity.js';
import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';

const STALE_SENT_SKELETON_ROWS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

export const StaleSentQuotesWidget: React.FC = () => {
  const trpc = useTRPC();
  const jobAccess = useCan('equipment_job:read');
  const staleSentQuery = useQuery(trpc.quotes.staleSent.queryOptions());
  const staleQuotes = staleSentQuery.data?.items ?? [];

  if (staleSentQuery.error) {
    return (
      <DashboardListScrollArea>
        <DashboardWidgetError error={staleSentQuery.error} fallbackMessage="Unable to load stale sent quotes." />
      </DashboardListScrollArea>
    );
  }

  if (staleSentQuery.isPending) {
    return (
      <DashboardListScrollArea>
        <StaleSentQuotesWidgetSkeleton />
      </DashboardListScrollArea>
    );
  }

  if (staleQuotes.length === 0) {
    return (
      <DashboardListScrollArea>
        <DashboardWidgetEmpty>No sent quotes awaiting a response.</DashboardWidgetEmpty>
      </DashboardListScrollArea>
    );
  }

  return (
    <DashboardListScrollArea>
      <DashboardList className="pr-3">
        {staleQuotes.map((quote) => (
          <DashboardListItem key={quote.id}>
            <StaleSentQuoteRow canOpenJobs={jobAccess.can} quote={quote} />
          </DashboardListItem>
        ))}
      </DashboardList>
    </DashboardListScrollArea>
  );
};

function StaleSentQuoteRow({ canOpenJobs, quote }: { canOpenJobs: boolean; quote: StaleSentQuote }) {
  return (
    <div className="grid min-w-0 grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
      <StaleSentQuoteRowContent canOpenJobs={canOpenJobs} quote={quote} />
    </div>
  );
}

export function StaleSentQuoteRowContent({ canOpenJobs, quote }: { canOpenJobs: boolean; quote: StaleSentQuote }) {
  return (
    <>
      <DashboardQuoteIdentity canOpenJob={canOpenJobs} quote={quote} />
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
          <span className="flex min-w-0 items-center gap-2">
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <span className="flex min-w-0 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </span>
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
