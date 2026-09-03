import { formatDate } from '@pkg/domain';
import type { QuoteWeeklyFlowSummary } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';

import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';

const QUOTE_FLOW_CHART_CONFIG = {
  acceptedCount: {
    color: 'var(--chart-1)',
    label: 'Accepted',
  },
  createdCount: {
    color: 'var(--chart-2)',
    label: 'Created',
  },
} satisfies ChartConfig;

const QUOTE_FLOW_SKELETON_BARS = [
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

export const QuoteFlowWidget: React.FC = () => {
  const trpc = useTRPC();
  const weeklyFlowQuery = useQuery(trpc.quotes.weeklyFlow.queryOptions());
  const summary = weeklyFlowQuery.data;

  if (weeklyFlowQuery.error) {
    return <DashboardWidgetError error={weeklyFlowQuery.error} fallbackMessage="Unable to load the quote flow." />;
  }

  if (weeklyFlowQuery.isPending) {
    return <QuoteFlowWidgetSkeleton />;
  }

  if (!summary || getTotalFlowCount(summary) === 0) {
    return <DashboardWidgetEmpty>No quotes created or accepted in the last 12 weeks.</DashboardWidgetEmpty>;
  }

  const chartData = summary.items.map((item) => ({
    ...item,
    label: formatDate(item.weekStartDate, 'MMM d'),
  }));

  return (
    <div className="flex flex-col gap-3">
      <ChartContainer config={QUOTE_FLOW_CHART_CONFIG} className="h-56 w-full">
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
          <ChartLegend content={<ChartLegendContent />} />
          <Area
            dataKey="createdCount"
            fill="var(--color-createdCount)"
            fillOpacity={0.18}
            stroke="var(--color-createdCount)"
            strokeWidth={2}
            type="monotone"
          />
          <Area
            dataKey="acceptedCount"
            fill="var(--color-acceptedCount)"
            fillOpacity={0.18}
            stroke="var(--color-acceptedCount)"
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
};

function QuoteFlowWidgetSkeleton() {
  return (
    <div className="flex h-56 items-end gap-2">
      {QUOTE_FLOW_SKELETON_BARS.map((bar) => (
        <Skeleton key={bar} className="min-h-8 flex-1" style={{ height: `${32 + (bar.length % 6) * 18}px` }} />
      ))}
    </div>
  );
}

function getTotalFlowCount(summary: QuoteWeeklyFlowSummary): number {
  return summary.items.reduce((total, item) => total + item.createdCount + item.acceptedCount, 0);
}
