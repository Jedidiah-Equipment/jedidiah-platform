import { formatDate } from '@pkg/domain';
import type { PriorityQuote } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';

import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';

const AWAITING_JOB_CREATION_SKELETON_ROWS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

export const AwaitingJobCreationWidget: React.FC = () => {
  const trpc = useTRPC();
  const priorityQuotesQuery = useQuery(trpc.quotes.priorityList.queryOptions());
  const quotes = priorityQuotesQuery.data ?? [];

  if (priorityQuotesQuery.error) {
    return <DashboardWidgetError error={priorityQuotesQuery.error} fallbackMessage="Unable to load awaiting quotes." />;
  }

  if (priorityQuotesQuery.isPending) {
    return <AwaitingJobCreationWidgetSkeleton />;
  }

  if (quotes.length === 0) {
    return <DashboardWidgetEmpty>No accepted quotes need Jobs.</DashboardWidgetEmpty>;
  }

  return (
    <ul className="flex flex-col divide-y">
      {quotes.map((quote) => (
        <li key={quote.id}>
          <AwaitingJobCreationRow quote={quote} />
        </li>
      ))}
    </ul>
  );
};

function AwaitingJobCreationRow({ quote }: { quote: PriorityQuote }) {
  return (
    <Link
      className="group grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 py-3 text-sm first:pt-0 last:pb-0"
      params={{ id: quote.id }}
      to="/quotes/$id/edit"
    >
      <EntityThumbnail label={quote.customerCompanyName} size="sm" thumbnailDataUrl={quote.customerThumbnailDataUrl} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground group-hover:underline">{quote.code}</span>
        <span className="block truncate text-muted-foreground">{quote.customerCompanyName}</span>
      </span>
      <span className="text-right">
        <span className="block font-medium tabular-nums">{formatDate(quote.earliestDeliveryDate, 'MMM d')}</span>
        <span className="block text-muted-foreground text-xs">Earliest delivery</span>
      </span>
    </Link>
  );
}

function AwaitingJobCreationWidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {AWAITING_JOB_CREATION_SKELETON_ROWS.map((row) => (
        <div key={row} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <Skeleton className="size-6 rounded-md" />
          <span className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-36 max-w-full" />
          </span>
          <span className="flex flex-col items-end gap-2">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-3 w-20" />
          </span>
        </div>
      ))}
    </div>
  );
}
