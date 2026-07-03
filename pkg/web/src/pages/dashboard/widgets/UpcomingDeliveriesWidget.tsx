import { formatDate, getJobProjectedFinishDates, isJobDeliveryAtRisk, listEnabledBays } from '@pkg/domain';
import type { DateOnlyIso, UpcomingDeliveryQuote, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';
import { useMemo } from 'react';

import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Badge } from '@/components/ui/badge.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { JobCodeDisplay } from '@/pages/jobs/components/JobCodeDisplay.js';

import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';

const UPCOMING_DELIVERIES_MAX_ROWS = 8;
const UPCOMING_DELIVERIES_SKELETON_ROWS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

export const UpcomingDeliveriesWidget: React.FC = () => {
  const trpc = useTRPC();
  const jobAccess = useCan('job:read');
  const deliveriesQuery = useQuery(trpc.quotes.upcomingDeliveries.queryOptions());
  const baysQuery = useQuery({
    ...trpc.jobs.listBays.queryOptions(),
    enabled: jobAccess.can,
  });
  const finishDatesByJobId = useMemo(
    () => (baysQuery.data ? getJobProjectedFinishDates(listEnabledBays(baysQuery.data.items)) : new Map()),
    [baysQuery.data],
  );

  if (deliveriesQuery.error) {
    return <DashboardWidgetError error={deliveriesQuery.error} fallbackMessage="Unable to load upcoming deliveries." />;
  }

  if (jobAccess.can && baysQuery.error) {
    return <DashboardWidgetError error={baysQuery.error} fallbackMessage="Unable to load delivery risk." />;
  }

  if (deliveriesQuery.isPending || (jobAccess.can && baysQuery.isPending)) {
    return <UpcomingDeliveriesWidgetSkeleton />;
  }

  const result = deliveriesQuery.data;
  const deliveries = result.items;

  if (deliveries.length === 0) {
    return <DashboardWidgetEmpty>No upcoming deliveries.</DashboardWidgetEmpty>;
  }

  const visibleDeliveries = deliveries.slice(0, UPCOMING_DELIVERIES_MAX_ROWS);
  const hiddenDeliveryCount = deliveries.length - visibleDeliveries.length;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <ScrollArea className="max-h-80">
        <ul className="flex flex-col divide-y pr-3">
          {visibleDeliveries.map((quote) => (
            <li key={quote.id}>
              <UpcomingDeliveryRow
                finishDatesByJobId={finishDatesByJobId}
                canOpenJobs={jobAccess.can}
                quote={quote}
                today={result.today}
              />
            </li>
          ))}
        </ul>
      </ScrollArea>
      {hiddenDeliveryCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          Showing first {visibleDeliveries.length} of {deliveries.length} planned deliveries.
        </p>
      ) : null}
    </div>
  );
};

function UpcomingDeliveryRow({
  canOpenJobs,
  finishDatesByJobId,
  quote,
  today,
}: {
  canOpenJobs: boolean;
  finishDatesByJobId: ReadonlyMap<UUID, DateOnlyIso>;
  quote: UpcomingDeliveryQuote;
  today: DateOnlyIso;
}) {
  const quoteName = quote.kind === 'custom' ? (quote.workTitle ?? 'Custom work') : (quote.productName ?? '—');
  const isOverdue = quote.plannedDeliveryDate < today;
  const isAtRisk =
    canOpenJobs && quote.job
      ? isJobDeliveryAtRisk({
          finishDatesByJobId,
          jobId: quote.job.jobId,
          plannedDeliveryDate: quote.plannedDeliveryDate,
        })
      : false;

  return (
    <div className="grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 py-3 text-sm first:pt-0 last:pb-0">
      <EntityThumbnail label={quote.customerCompanyName} size="sm" thumbnailDataUrl={quote.customerThumbnailDataUrl} />
      <span className="min-w-0">
        <Link className="block truncate font-medium hover:underline" params={{ id: quote.id }} to="/quotes/$id/edit">
          {quote.code}
        </Link>
        <span className="block truncate text-muted-foreground">{quote.customerCompanyName}</span>
        <span className="block truncate text-muted-foreground text-xs">
          {quoteName}
          {quote.job ? (
            <>
              <span className="px-1">·</span>
              <JobCodeDisplay canOpenJob={canOpenJobs} jobCode={quote.job.jobCode} jobId={quote.job.jobId} />
            </>
          ) : null}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1 text-right">
        <span className="font-medium tabular-nums">{formatDate(quote.plannedDeliveryDate, 'MMM d')}</span>
        <span className="flex flex-wrap justify-end gap-1">
          {isOverdue ? <Badge variant="destructive">Overdue</Badge> : null}
          {isAtRisk ? <Badge variant="destructive">At risk</Badge> : null}
        </span>
      </span>
    </div>
  );
}

function UpcomingDeliveriesWidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {UPCOMING_DELIVERIES_SKELETON_ROWS.map((row) => (
        <div key={row} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <Skeleton className="size-6 rounded-md" />
          <span className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-36 max-w-full" />
            <Skeleton className="h-3 w-28 max-w-full" />
          </span>
          <span className="flex flex-col items-end gap-2">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-5 w-16" />
          </span>
        </div>
      ))}
    </div>
  );
}
