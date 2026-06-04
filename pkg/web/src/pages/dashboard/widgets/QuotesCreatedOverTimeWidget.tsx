import { formatDate } from '@pkg/domain';
import type { QuoteCreatedByWeekSummary } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';

import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';

const QUOTES_CREATED_CHART_CONFIG = {
  count: {
    color: 'var(--chart-2)',
    label: 'Quotes created',
  },
} satisfies ChartConfig;

const QUOTES_CREATED_SKELETON_BARS = [
  'week-1',
  'week-2',
  'week-3',
  'week-4',
  'week-5',
  'week-6',
  'week-7',
  'week-8',
  'week-9',
  'week-10',
  'week-11',
  'week-12',
] as const;

export const QuotesCreatedOverTimeWidget: React.FC = () => {
  const trpc = useTRPC();
  const createdByWeekQuery = useQuery(trpc.quotes.createdByWeek.queryOptions());
  const summary = createdByWeekQuery.data;

  if (createdByWeekQuery.error) {
    return (
      <DashboardWidgetError
        error={createdByWeekQuery.error}
        fallbackMessage="Unable to load quotes created over time."
      />
    );
  }

  if (createdByWeekQuery.isPending) {
    return <QuotesCreatedOverTimeWidgetSkeleton />;
  }

  if (!summary || getTotalCreatedQuotes(summary) === 0) {
    return <DashboardWidgetEmpty>No quotes created in the last 12 weeks.</DashboardWidgetEmpty>;
  }

  const chartData = summary.items.map((item) => ({
    ...item,
    label: formatDate(item.weekStartDate, 'MMM d'),
  }));

  return (
    <div className="flex flex-col gap-3">
      <ChartContainer config={QUOTES_CREATED_CHART_CONFIG} className="h-56 w-full">
        <AreaChart accessibilityLayer data={chartData} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
            tickMargin={8}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const item = payload[0]?.payload;
                  return typeof item?.weekStartDate === 'string' ? formatDate(item.weekStartDate, 'PP') : null;
                }}
              />
            }
          />
          <Area
            dataKey="count"
            fill="var(--color-count)"
            fillOpacity={0.18}
            stroke="var(--color-count)"
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
};

function QuotesCreatedOverTimeWidgetSkeleton() {
  return (
    <div className="flex h-56 items-end gap-2">
      {QUOTES_CREATED_SKELETON_BARS.map((bar) => (
        <Skeleton key={bar} className="min-h-8 flex-1" style={{ height: `${32 + (bar.length % 6) * 18}px` }} />
      ))}
    </div>
  );
}

function getTotalCreatedQuotes(summary: QuoteCreatedByWeekSummary): number {
  return summary.items.reduce((total, item) => total + item.count, 0);
}
