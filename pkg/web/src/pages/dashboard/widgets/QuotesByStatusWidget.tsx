import type { QuoteStatusSummary } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';

import { quoteStatusLabels } from '../../quotes/components/QuoteStatusBadge.js';
import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';

const QUOTE_STATUS_CHART_CONFIG = {
  accepted: {
    color: 'var(--chart-3)',
    label: quoteStatusLabels.accepted,
  },
  cancelled: {
    color: 'var(--chart-5)',
    label: quoteStatusLabels.cancelled,
  },
  count: {
    label: 'Quotes',
  },
  draft: {
    color: 'var(--chart-1)',
    label: quoteStatusLabels.draft,
  },
  rejected: {
    color: 'var(--chart-4)',
    label: quoteStatusLabels.rejected,
  },
  sent: {
    color: 'var(--chart-2)',
    label: quoteStatusLabels.sent,
  },
} satisfies ChartConfig;

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
    fill: `var(--color-${item.status})`,
    label: quoteStatusLabels[item.status],
  }));

  return (
    <div className="flex flex-col gap-4">
      <ChartContainer config={QUOTE_STATUS_CHART_CONFIG} className="h-52 w-full">
        <BarChart accessibilityLayer data={chartData} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
          <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="status" />} />
          <Bar dataKey="count" radius={4}>
            {chartData.map((item) => (
              <Cell key={item.status} fill={item.fill} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
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
      <div className="flex h-52 items-end gap-3">
        <Skeleton className="h-20 flex-1" />
        <Skeleton className="h-32 flex-1" />
        <Skeleton className="h-44 flex-1" />
        <Skeleton className="h-24 flex-1" />
        <Skeleton className="h-28 flex-1" />
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
