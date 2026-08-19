import {
  computeBayLoadTodayByDepartment,
  type DepartmentBayLoadToday,
  departmentLabels,
  JOB_DEPARTMENT_PIPELINE,
  statusBadgeColorClassNames,
} from '@pkg/domain';
import type React from 'react';
import { Label, PolarAngleAxis, PolarRadiusAxis, RadialBar, RadialBarChart } from 'recharts';

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart.js';
import { Skeleton } from '@/components/ui/skeleton.js';

import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';
import { useShopFloorBays } from '../use-shop-floor-bays.js';

export const BAY_LOAD_CHART_CONFIG = {
  notUnderLoad: {
    color: 'var(--color-muted-foreground)',
    label: 'Not under load',
  },
  underLoad: {
    color: 'var(--color-blue-500)',
    label: 'Under load',
  },
} satisfies ChartConfig;

export const BAY_LOAD_DEPARTMENTS: ReadonlySet<string> = new Set(['fabrication', 'paint']);
export const BAY_LOAD_CHART_HEIGHT_PX = 80;

export const BayLoadTodayWidget: React.FC = () => {
  const bays = useShopFloorBays();

  if (bays.status === 'error') {
    return <DashboardWidgetError error={bays.error} fallbackMessage="Unable to load bay load." />;
  }

  if (bays.status === 'pending') {
    return <BayLoadTodayWidgetSkeleton />;
  }

  if (bays.enabledBays.length === 0) {
    return <DashboardWidgetEmpty>No enabled Bays.</DashboardWidgetEmpty>;
  }

  const departmentLoads = computeBayLoadTodayByDepartment({
    bays: bays.enabledBays,
    today: bays.today,
    workingCalendarsByBayId: bays.workingCalendarsByBayId,
  }).filter(({ department }) => BAY_LOAD_DEPARTMENTS.has(department));

  return (
    <div className="flex flex-col gap-4">
      <BayLoadLegend />
      <div className="grid grid-cols-2 gap-3">
        {departmentLoads.map((load) => (
          <DepartmentBayLoadChart key={load.department} load={load} />
        ))}
      </div>
    </div>
  );
};

export function toBayLoadChartData(load: Pick<DepartmentBayLoadToday, 'totalCount' | 'workingCount'>) {
  return [
    {
      notUnderLoad: load.totalCount - load.workingCount,
      underLoad: load.workingCount,
    },
  ];
}

function DepartmentBayLoadChart({ load }: { load: DepartmentBayLoadToday }) {
  return (
    <section
      className="flex min-w-0 flex-col items-center"
      aria-label={`${departmentLabels[load.department]} Bay load: ${load.loadPercent}%`}
    >
      <h3 className="truncate text-center font-medium text-sm">{departmentLabels[load.department]}</h3>
      <ChartContainer
        config={BAY_LOAD_CHART_CONFIG}
        className="mx-auto w-full max-w-44"
        style={{ height: BAY_LOAD_CHART_HEIGHT_PX }}
      >
        <RadialBarChart
          accessibilityLayer
          data={toBayLoadChartData(load)}
          startAngle={180}
          endAngle={0}
          innerRadius={46}
          outerRadius={64}
          cy="85%"
        >
          <PolarAngleAxis domain={[0, load.totalCount]} tick={false} type="number" />
          <PolarRadiusAxis axisLine={false} tick={false} tickLine={false}>
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null;

                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy ?? 0) - 8}
                      className="fill-foreground font-semibold text-xl tabular-nums"
                    >
                      {load.loadPercent}%
                    </tspan>
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy ?? 0) + 8}
                      className="fill-muted-foreground text-xs tabular-nums"
                    >
                      {load.workingCount} of {load.totalCount} Bays
                    </tspan>
                  </text>
                );
              }}
            />
          </PolarRadiusAxis>
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <RadialBar
            className={`${statusBadgeColorClassNames.blue.fill} stroke-2 stroke-transparent`}
            cornerRadius={6}
            dataKey="underLoad"
            fill="var(--color-underLoad)"
            stackId="load"
          />
          <RadialBar
            className="fill-muted-foreground stroke-2 stroke-transparent"
            cornerRadius={6}
            dataKey="notUnderLoad"
            fill="var(--color-notUnderLoad)"
            stackId="load"
          />
        </RadialBarChart>
      </ChartContainer>
    </section>
  );
}

function BayLoadLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground text-xs">
      <span className="flex items-center gap-1.5">
        <span className={`size-2.5 rounded-sm ${statusBadgeColorClassNames.blue.dot}`} />
        Under load
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-muted-foreground" />
        Not under load
      </span>
    </div>
  );
}

function BayLoadTodayWidgetSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {JOB_DEPARTMENT_PIPELINE.filter(({ department }) => BAY_LOAD_DEPARTMENTS.has(department)).map(
          ({ department }) => (
            <div key={department} className="flex flex-col items-center gap-3">
              <Skeleton className="h-4 w-20 max-w-full" />
              <Skeleton className="h-20 w-full max-w-44 rounded-t-full" />
            </div>
          ),
        )}
      </div>
    </div>
  );
}
