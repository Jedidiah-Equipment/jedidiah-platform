import { countPhrase, formatNumber } from '@pkg/domain';
import { quoteStageLabels } from '@pkg/domain/equipment';
import { QuoteStage } from '@pkg/schema/equipment';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { DashboardWidgetEmpty, DashboardWidgetError } from '@/components/common/dashboard/DashboardWidgetCard.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';

const quoteStageColors = {
  draft: { color: 'var(--chart-1)' },
  sent: { color: 'var(--chart-2)' },
  accepted: { color: 'var(--chart-3)' },
  'awaiting-pricing': { color: 'var(--chart-3)' },
  'awaiting-approval': { color: 'var(--chart-3)' },
  'awaiting-invoice': { color: 'var(--chart-3)' },
  invoiced: { color: 'var(--chart-3)' },
  rejected: { color: 'var(--chart-4)' },
  cancelled: { color: 'var(--chart-5)' },
} as const satisfies Record<QuoteStage, { color: string }>;

export const QuotesByStatusWidget: React.FC = () => {
  const trpc = useTRPC();
  const countsQuery = useQuery(trpc.quotes.stageCounts.queryOptions());
  const counts = countsQuery.data?.counts;

  if (countsQuery.error) {
    return <DashboardWidgetError error={countsQuery.error} fallbackMessage="Unable to load Quote counts." />;
  }

  if (!counts) {
    return <QuotesByStatusWidgetSkeleton />;
  }

  if (Object.values(counts).every((count) => count === 0)) {
    return <DashboardWidgetEmpty>No quotes yet.</DashboardWidgetEmpty>;
  }

  const chartData = QuoteStage.options.map((stage) => ({
    count: counts[stage],
    fill: quoteStageColors[stage].color,
    label: quoteStageLabels[stage],
    stage,
  }));
  const maxCount = Math.max(...chartData.map((item) => item.count), 1);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(9rem,12rem)]">
      <div className="flex min-w-0 flex-col gap-3">
        {chartData.map((item) => (
          <div key={item.stage} className="grid min-w-0 grid-cols-[8rem_1fr] items-center gap-3 text-sm">
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
                  {item.label}: {countPhrase(item.count, 'Quote', 'Quotes')}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <dl className="grid content-start gap-y-2 text-sm">
        {chartData.map((item) => (
          <div key={item.stage} className="flex items-center justify-between gap-3">
            <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item.fill }} />
              <span className="truncate">{item.label}</span>
            </dt>
            <dd className="font-medium tabular-nums">{formatNumber(item.count)}</dd>
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
        {QuoteStage.options.map((stage) => (
          <div key={stage} className="grid grid-cols-[8rem_1fr] items-center gap-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {QuoteStage.options.map((stage) => (
          <div key={stage} className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-6" />
          </div>
        ))}
      </div>
    </div>
  );
}
