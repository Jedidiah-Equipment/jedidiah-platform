import {
  BAY_RUNWAY_CAP_WORKING_DAYS,
  byBayDepartmentPipeline,
  computeBayRunway,
  departmentLabels,
  groupBaysByDepartmentPipeline,
  statusBadgeColorClassNames,
  type WorkingCalendar,
} from '@pkg/domain';
import type { DateOnlyIso, ProjectedBayQueue } from '@pkg/schema';
import type React from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Skeleton } from '@/components/ui/skeleton.js';

import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';
import { SHOP_FLOOR_BAND_HEIGHT_PX } from '../dashboard-widget-layout.js';
import { useShopFloorBays } from '../use-shop-floor-bays.js';

export const BAY_RUNWAY_CHART_CONFIG = {
  inProgressWorkDays: {
    color: 'var(--color-blue-500)',
    label: 'In progress days',
  },
  scheduledWorkDays: {
    color: 'var(--color-emerald-500)',
    label: 'Scheduled days',
  },
} satisfies ChartConfig;

export const BAY_RUNWAY_BAR_CLASS_NAMES = {
  inProgressWorkDays: statusBadgeColorClassNames.blue.fill,
  scheduledWorkDays: statusBadgeColorClassNames.green.fill,
} as const;

export const BAY_RUNWAY_AXIS_TICK_STYLE = {
  fill: 'var(--foreground)',
  fontSize: 14,
} as const satisfies React.CSSProperties;

export const BAY_RUNWAY_DAY_TICKS = [0, 5, 10, 15, 20, 25, BAY_RUNWAY_CAP_WORKING_DAYS] as const;

export const BAY_RUNWAY_ROW_BACKGROUND = {
  fill: 'var(--muted)',
  fillOpacity: 0.2,
  stroke: 'var(--border)',
} as const;

const BAY_RUNWAY_SKELETON_ROWS = ['first', 'second', 'third', 'fourth'] as const;
const BAY_RUNWAY_ROW_HEIGHT_PX = 36;

export const BayRunwayWidget: React.FC = () => {
  const bays = useShopFloorBays();

  if (bays.status === 'error') {
    return <DashboardWidgetError error={bays.error} fallbackMessage="Unable to load the bay runway." />;
  }

  if (bays.status === 'pending') {
    return <BayRunwayWidgetSkeleton />;
  }

  if (bays.enabledBays.length === 0) {
    return <BayRunwayEmpty>No enabled Bays.</BayRunwayEmpty>;
  }

  // Recharts spreads data entries onto SVG shape elements, so keys must not collide with
  // real attributes (e.g. a boolean `overflow`).
  const chartData = buildBayRunwayChartData({
    bays: bays.enabledBays,
    today: bays.today,
    workingCalendarsByBayId: bays.workingCalendarsByBayId,
  }).filter(hasBayRunwayScheduling);

  if (chartData.length === 0) {
    return <BayRunwayEmpty>No scheduled work.</BayRunwayEmpty>;
  }

  const departmentGroups = groupBaysByDepartmentPipeline(chartData);

  return (
    <ScrollArea style={{ height: SHOP_FLOOR_BAND_HEIGHT_PX }}>
      <div className="flex flex-col gap-4 pr-3" style={{ minHeight: SHOP_FLOOR_BAND_HEIGHT_PX }}>
        <BayRunwayDayScale />
        {departmentGroups.map(({ bays: departmentBays, department }) => (
          <section key={department} className="flex flex-col gap-1">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {departmentLabels[department]}
            </h3>
            <BayRunwayChart chartData={departmentBays} />
          </section>
        ))}
      </div>
    </ScrollArea>
  );
};

export function getBayRunwayChartHeight(rowCount: number): number {
  return rowCount * BAY_RUNWAY_ROW_HEIGHT_PX;
}

export function hasBayRunwayScheduling(
  runway: Pick<
    ReturnType<typeof buildBayRunwayChartData>[number],
    'inProgressWorkDays' | 'overflowLabel' | 'scheduledWorkDays'
  >,
): boolean {
  return runway.inProgressWorkDays > 0 || runway.scheduledWorkDays > 0 || runway.overflowLabel !== '';
}

function BayRunwayAxisTick({ payload, x = 0, y = 0 }: { payload?: { value?: unknown }; x?: number; y?: number }) {
  const value = payload?.value;
  const label = typeof value === 'string' || typeof value === 'number' ? String(value) : '';

  return (
    <text x={x} y={y} dy="0.355em" textAnchor="end" style={BAY_RUNWAY_AXIS_TICK_STYLE}>
      {label}
    </text>
  );
}

function BayRunwayChart({ chartData }: { chartData: ReturnType<typeof buildBayRunwayChartData> }) {
  return (
    <ChartContainer
      config={BAY_RUNWAY_CHART_CONFIG}
      className="w-full"
      style={{ height: getBayRunwayChartHeight(chartData.length) }}
    >
      <BarChart
        accessibilityLayer
        barCategoryGap="20%"
        data={chartData}
        layout="vertical"
        margin={{ bottom: 0, left: 0, right: 28, top: 0 }}
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" vertical />
        <XAxis domain={[0, BAY_RUNWAY_CAP_WORKING_DAYS]} hide ticks={[...BAY_RUNWAY_DAY_TICKS]} type="number" />
        <YAxis
          axisLine={false}
          dataKey="label"
          interval={0}
          tick={<BayRunwayAxisTick />}
          tickLine={false}
          type="category"
          width={112}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          background={BAY_RUNWAY_ROW_BACKGROUND}
          className={BAY_RUNWAY_BAR_CLASS_NAMES.inProgressWorkDays}
          dataKey="inProgressWorkDays"
          fill="var(--color-inProgressWorkDays)"
          radius={[2, 0, 0, 2]}
          stackId="runway"
        />
        <Bar
          className={BAY_RUNWAY_BAR_CLASS_NAMES.scheduledWorkDays}
          dataKey="scheduledWorkDays"
          fill="var(--color-scheduledWorkDays)"
          radius={[0, 2, 2, 0]}
          stackId="runway"
        >
          <LabelList className="fill-primary text-xs font-medium" dataKey="overflowLabel" position="right" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function BayRunwayDayScale() {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] pr-7">
      <span />
      <span className="flex justify-between text-xs text-muted-foreground tabular-nums">
        {BAY_RUNWAY_DAY_TICKS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </span>
    </div>
  );
}

export function buildBayRunwayChartData({
  bays,
  today,
  workingCalendarsByBayId,
}: {
  bays: readonly ProjectedBayQueue[];
  today: DateOnlyIso;
  workingCalendarsByBayId: ReadonlyMap<string, WorkingCalendar>;
}) {
  return [...bays].sort(byBayDepartmentPipeline).map((bay) => {
    const runway = computeBayRunway({
      bay,
      today,
      workingCalendar: workingCalendarsByBayId.get(bay.id) ?? {},
    });

    return {
      department: bay.department,
      inProgressWorkDays: runway.inProgressWorkDays,
      label: runway.label,
      overflowLabel: runway.overflow ? `${BAY_RUNWAY_CAP_WORKING_DAYS}+` : '',
      scheduledWorkDays: runway.scheduledWorkDays,
    };
  });
}

function BayRunwayEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: SHOP_FLOOR_BAND_HEIGHT_PX }}>
      <DashboardWidgetEmpty>{children}</DashboardWidgetEmpty>
    </div>
  );
}

function BayRunwayWidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3" style={{ height: SHOP_FLOOR_BAND_HEIGHT_PX }}>
      {BAY_RUNWAY_SKELETON_ROWS.map((row) => (
        <div key={row} className="flex items-center gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 flex-1" style={{ maxWidth: `${40 + (row.length % 4) * 18}%` }} />
        </div>
      ))}
    </div>
  );
}
