import { BAY_RUNWAY_CAP_WORKING_DAYS, computeBayRunway } from '@pkg/domain';
import type React from 'react';
import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts';

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart.js';
import { Skeleton } from '@/components/ui/skeleton.js';

import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';
import { useShopFloorBays } from '../use-shop-floor-bays.js';

const BAY_RUNWAY_CHART_CONFIG = {
  idleDays: {
    color: 'var(--chart-2)',
    label: 'Idle days',
  },
  workDays: {
    color: 'var(--chart-1)',
    label: 'Work days',
  },
} satisfies ChartConfig;

const BAY_RUNWAY_SKELETON_ROWS = ['first', 'second', 'third', 'fourth'] as const;
const BAY_RUNWAY_ROW_HEIGHT = 36;

export const BayRunwayWidget: React.FC = () => {
  const bays = useShopFloorBays();

  if (bays.status === 'error') {
    return <DashboardWidgetError error={bays.error} fallbackMessage="Unable to load the bay runway." />;
  }

  if (bays.status === 'pending') {
    return <BayRunwayWidgetSkeleton />;
  }

  if (bays.enabledBays.length === 0) {
    return <DashboardWidgetEmpty>No enabled Bays.</DashboardWidgetEmpty>;
  }

  // Recharts spreads data entries onto SVG shape elements, so keys must not collide with
  // real attributes (e.g. a boolean `overflow`).
  const chartData = bays.enabledBays.map((bay) => {
    const runway = computeBayRunway({
      bay,
      today: bays.today,
      workingCalendar: bays.workingCalendarsByBayId.get(bay.id) ?? {},
    });

    return {
      bayName: runway.bayName,
      idleDays: runway.idleDays,
      overflowLabel: runway.overflow ? `${BAY_RUNWAY_CAP_WORKING_DAYS}+` : '',
      workDays: runway.workDays,
    };
  });

  return (
    <ChartContainer
      config={BAY_RUNWAY_CHART_CONFIG}
      className="w-full"
      style={{ height: `${chartData.length * BAY_RUNWAY_ROW_HEIGHT + 24}px` }}
    >
      <BarChart
        accessibilityLayer
        data={chartData}
        layout="vertical"
        margin={{ bottom: 0, left: 0, right: 28, top: 0 }}
      >
        <XAxis domain={[0, BAY_RUNWAY_CAP_WORKING_DAYS]} hide type="number" />
        <YAxis axisLine={false} dataKey="bayName" tickLine={false} type="category" width={96} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="workDays" fill="var(--color-workDays)" radius={[2, 0, 0, 2]} stackId="runway" />
        <Bar dataKey="idleDays" fill="var(--color-idleDays)" radius={[0, 2, 2, 0]} stackId="runway">
          <LabelList className="fill-destructive text-xs font-medium" dataKey="overflowLabel" position="right" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
};

function BayRunwayWidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {BAY_RUNWAY_SKELETON_ROWS.map((row) => (
        <div key={row} className="flex items-center gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 flex-1" style={{ maxWidth: `${40 + (row.length % 4) * 18}%` }} />
        </div>
      ))}
    </div>
  );
}
