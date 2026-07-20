import { quoteStatusLabels } from '@pkg/domain';
import type { QuoteStatusSummary } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';

const quoteStatusColors = {
  accepted: {
    color: 'var(--chart-3)',
  },
  cancelled: {
    color: 'var(--chart-5)',
  },
  draft: {
    color: 'var(--chart-1)',
  },
  rejected: {
    color: 'var(--chart-4)',
  },
  sent: {
    color: 'var(--chart-2)',
  },
} as const;

export const QuotesByStatusWidget: React.FC = () => {
  const trpc = useTRPC();
  const summaryQuery = useQuery(trpc.quotes.summaryByStatus.queryOptions());
  const summary = summaryQuery.data;

  if (summaryQuery.error) {
    return <DashboardWidgetError error={summaryQuery.error} fallbackMessage="Unable to load quote status summary." />;
  }

  if (summaryQuery.isPending) {
    return <QuotesByStatusWidgetSkeleton />;
  }

  if (!summary || getTotalQuotes(summary) === 0) {
    return <DashboardWidgetEmpty>No quotes yet.</DashboardWidgetEmpty>;
  }

  const chartData = summary.items.map((item) => ({
    ...item,
    fill: quoteStatusColors[item.status].color,
    label: quoteStatusLabels[item.status],
  }));
  const maxCount = Math.max(...chartData.map((item) => item.count), 1);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(9rem,12rem)]">
      <div className="flex min-w-0 flex-col gap-3">
        {chartData.map((item) => (
          <div key={item.status} className="grid min-w-0 grid-cols-[4.5rem_1fr] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground">{item.label}</span>
            <div className="h-3 min-w-0 overflow-hidden rounded-sm bg-muted">
              <div
                className="h-full rounded-sm"
                style={{
                  backgroundColor: item.fill,
                  width: `${Math.max((item.count / maxCount) * 100, item.count > 0 ? 8 : 0)}%`,
                }}
              >
                <span className="sr-only">
                  {item.label}: {item.count} quotes
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <dl className="grid content-start gap-y-2 text-sm">
        {chartData.map((item) => (
          <div key={item.status} className="flex items-center justify-between gap-3">
            <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item.fill }} />
              <span className="truncate">{item.label}</span>
            </dt>
            <dd className="font-medium tabular-nums">{item.count}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

function QuotesByStatusWidgetSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {['draft', 'sent', 'accepted', 'rejected', 'cancelled'].map((status) => (
          <div key={status} className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {['draft', 'sent', 'accepted', 'rejected', 'cancelled'].map((status) => (
          <div key={status} className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-6" />
          </div>
        ))}
      </div>
    </div>
  );
}

function getTotalQuotes(summary: QuoteStatusSummary): number {
  return summary.items.reduce((total, item) => total + item.count, 0);
}
