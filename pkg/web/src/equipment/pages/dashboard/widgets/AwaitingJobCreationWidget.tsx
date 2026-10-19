import { formatDate } from '@pkg/domain';
import type { QuoteSummary } from '@pkg/schema/equipment';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { DashboardListBlock, dashboardRowClassName } from '@/components/common/dashboard/DashboardListBlock.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { DashboardQuoteIdentity } from '../DashboardQuoteIdentity.js';

const AWAITING_JOB_CREATION_SKELETON_ROWS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

export const AwaitingJobCreationWidget: React.FC = () => {
  const trpc = useTRPC();
  const jobAccess = useCan('equipment_job:read');
  const awaitingQuotesQuery = useQuery(trpc.quotes.awaitingJobCreation.queryOptions());

  return (
    <DashboardListBlock
      rows={awaitingQuotesQuery.data}
      error={awaitingQuotesQuery.error}
      errorMessage="Unable to load awaiting quotes."
      empty="No accepted quotes need follow-up."
      skeleton={<AwaitingJobCreationWidgetSkeleton />}
      rowKey={(quote) => quote.id}
      renderRow={(quote) => <AwaitingJobCreationRow canOpenJobs={jobAccess.can} quote={quote} />}
    />
  );
};

export function AwaitingJobCreationRow({ canOpenJobs, quote }: { canOpenJobs: boolean; quote: QuoteSummary }) {
  const earliestDeliveryDate = getEarliestDeliveryDate(quote);

  return (
    <div className={dashboardRowClassName}>
      <DashboardQuoteIdentity canOpenJob={canOpenJobs} quote={quote} />
      <span className="text-right">
        {earliestDeliveryDate ? (
          <>
            <span className="block font-medium tabular-nums">{formatDate(earliestDeliveryDate, 'day')}</span>
            <span className="block text-muted-foreground text-xs">Earliest delivery</span>
          </>
        ) : (
          <span className="block text-muted-foreground text-xs">No delivery date</span>
        )}
      </span>
    </div>
  );
}

function getEarliestDeliveryDate(quote: Pick<QuoteSummary, 'plannedDeliveryDate' | 'preferredDeliveryDate'>) {
  return [quote.preferredDeliveryDate, quote.plannedDeliveryDate]
    .filter((date): date is NonNullable<typeof date> => date !== null)
    .sort()[0];
}

function AwaitingJobCreationWidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {AWAITING_JOB_CREATION_SKELETON_ROWS.map((row) => (
        <div key={row} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <Skeleton className="size-8 rounded-md" />
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
