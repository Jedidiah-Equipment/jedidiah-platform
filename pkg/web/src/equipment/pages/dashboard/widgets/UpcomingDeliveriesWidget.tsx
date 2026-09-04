import { formatDate, getJobProjectedFinishDates, isJobDeliveryAtRisk, listEnabledBays } from '@pkg/domain';
import type { DateOnlyIso, UpcomingDeliveryQuote, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

import { DashboardList, DashboardListItem, DashboardListScrollArea } from '../DashboardList.js';
import { DashboardQuoteIdentity } from '../DashboardQuoteIdentity.js';
import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';

const UPCOMING_DELIVERIES_SKELETON_ROWS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

export const UpcomingDeliveriesWidget: React.FC = () => {
  const trpc = useTRPC();
  const jobAccess = useCan('equipment_job:read');
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
    return (
      <DashboardListScrollArea>
        <DashboardWidgetError error={deliveriesQuery.error} fallbackMessage="Unable to load upcoming deliveries." />
      </DashboardListScrollArea>
    );
  }

  if (jobAccess.can && baysQuery.error) {
    return (
      <DashboardListScrollArea>
        <DashboardWidgetError error={baysQuery.error} fallbackMessage="Unable to load delivery risk." />
      </DashboardListScrollArea>
    );
  }

  if (deliveriesQuery.isPending || (jobAccess.can && baysQuery.isPending)) {
    return (
      <DashboardListScrollArea>
        <UpcomingDeliveriesWidgetSkeleton />
      </DashboardListScrollArea>
    );
  }

  const result = deliveriesQuery.data;
  const deliveries = result.items;

  if (deliveries.length === 0) {
    return (
      <DashboardListScrollArea>
        <DashboardWidgetEmpty>No upcoming deliveries.</DashboardWidgetEmpty>
      </DashboardListScrollArea>
    );
  }

  return (
    <DashboardListScrollArea>
      <DashboardList className="pr-3">
        {deliveries.map((quote) => (
          <DashboardListItem key={quote.id}>
            <UpcomingDeliveryRow
              finishDatesByJobId={finishDatesByJobId}
              canOpenJobs={jobAccess.can}
              quote={quote}
              today={result.today}
            />
          </DashboardListItem>
        ))}
      </DashboardList>
    </DashboardListScrollArea>
  );
};

export function UpcomingDeliveryRow({
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
    <div className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 text-sm">
      <DashboardQuoteIdentity canOpenJob={canOpenJobs} quote={quote} />
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
          <Skeleton className="size-8 rounded-md" />
          <span className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-40 max-w-full" />
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
