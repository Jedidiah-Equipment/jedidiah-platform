import { formatPercent } from '@pkg/domain';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { Area, AreaChart } from 'recharts';

import { type ChartConfig, ChartContainer } from '@/components/ui/chart.js';
import { useTRPC } from '@/lib/trpc.js';

import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';
import { StatCard, StatCardSkeleton } from '../StatCard.js';

const WIN_RATE_SPARKLINE_CONFIG = {
  acceptedCount: {
    color: 'var(--chart-1)',
    label: 'Quotes accepted',
  },
} satisfies ChartConfig;

export const WinRateWidget: React.FC = () => {
  const trpc = useTRPC();
  const pipelineQuery = useQuery(trpc.quotes.pipelineSummary.queryOptions());
  const weeklyFlowQuery = useQuery(trpc.quotes.weeklyFlow.queryOptions());

  if (pipelineQuery.error) {
    return <DashboardWidgetError error={pipelineQuery.error} fallbackMessage="Unable to load the win rate." />;
  }

  if (weeklyFlowQuery.error) {
    return <DashboardWidgetError error={weeklyFlowQuery.error} fallbackMessage="Unable to load the win rate." />;
  }

  if (pipelineQuery.isPending || weeklyFlowQuery.isPending) {
    return <StatCardSkeleton withSparkline />;
  }

  const { accepted90dCount, rejected90dCount } = pipelineQuery.data;
  const decidedCount = accepted90dCount + rejected90dCount;

  if (decidedCount === 0) {
    return <DashboardWidgetEmpty>No accepted or rejected quotes in the last 90 days.</DashboardWidgetEmpty>;
  }

  return (
    <StatCard
      sparkline={
        <ChartContainer config={WIN_RATE_SPARKLINE_CONFIG} className="h-10 w-full">
          <AreaChart data={weeklyFlowQuery.data.items} margin={{ bottom: 0, left: 0, right: 0, top: 2 }}>
            <Area
              dataKey="acceptedCount"
              fill="var(--color-acceptedCount)"
              fillOpacity={0.18}
              isAnimationActive={false}
              stroke="var(--color-acceptedCount)"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ChartContainer>
      }
      sublabel={`${accepted90dCount} accepted · ${rejected90dCount} rejected (90d)`}
      value={formatPercent((accepted90dCount / decidedCount) * 100, { decimals: 0 })}
    />
  );
};
