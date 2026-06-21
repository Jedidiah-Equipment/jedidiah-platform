import {
  type BayTodayOccupancy,
  departmentLabels,
  formatDate,
  getBayTodayOccupancy,
  getOffDayLabel,
  JOB_DEPARTMENT_PIPELINE,
  type WorkingCalendar,
} from '@pkg/domain';
import type { BaySchedule, DateOnlyIso, JobSummary, OffDay } from '@pkg/schema';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { BayOperatorIndicator } from '@/components/bays/index.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Badge } from '@/components/ui/badge.js';
import { Skeleton } from '@/components/ui/skeleton.js';

import { getSlotLabel } from '../../jobs/components/bay-schedule-summary.js';
import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';
import { useShopFloorBays } from '../use-shop-floor-bays.js';

const SHOP_FLOOR_SKELETON_ROWS = ['first', 'second', 'third', 'fourth'] as const;

export const ShopFloorTodayWidget: React.FC = () => {
  const bays = useShopFloorBays();

  if (bays.status === 'error') {
    return <DashboardWidgetError error={bays.error} fallbackMessage="Unable to load the shop floor." />;
  }

  if (bays.status === 'pending') {
    return <ShopFloorTodayWidgetSkeleton />;
  }

  const { enabledBays, jobsById, offDays, today, workingCalendarsByBayId } = bays;

  if (enabledBays.length === 0) {
    return <DashboardWidgetEmpty>No enabled Bays.</DashboardWidgetEmpty>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{formatDate(today, 'PP')}</p>
      {JOB_DEPARTMENT_PIPELINE.map(({ department }) => {
        const departmentBays = enabledBays.filter((bay) => bay.department === department);

        if (departmentBays.length === 0) {
          return null;
        }

        return (
          <div key={department} className="flex flex-col gap-1">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {departmentLabels[department]}
            </h3>
            <ul className="flex flex-col divide-y">
              {departmentBays.map((bay) => (
                <li key={bay.id}>
                  <ShopFloorBayRow
                    bay={bay}
                    jobsById={jobsById}
                    offDays={offDays}
                    today={today}
                    workingCalendar={workingCalendarsByBayId.get(bay.id) ?? {}}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

function ShopFloorBayRow({
  bay,
  jobsById,
  offDays,
  today,
  workingCalendar,
}: {
  bay: BaySchedule;
  jobsById: ReadonlyMap<string, JobSummary>;
  offDays: OffDay[];
  today: DateOnlyIso;
  workingCalendar: WorkingCalendar;
}) {
  const occupancy = getBayTodayOccupancy({ bay, today, workingCalendar });

  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(6rem,10rem)_1fr_auto] items-center gap-x-3 py-2 text-sm first:pt-0 last:pb-0">
      <BayOperatorIndicator operator={bay.currentOperator} size="sm" />
      <span className="truncate font-medium">{bay.name}</span>
      <ShopFloorOccupancyCell jobsById={jobsById} occupancy={occupancy} offDays={offDays} today={today} />
      <ShopFloorOccupancyBadge occupancy={occupancy} />
    </div>
  );
}

function ShopFloorOccupancyCell({
  jobsById,
  occupancy,
  offDays,
  today,
}: {
  jobsById: ReadonlyMap<string, JobSummary>;
  occupancy: BayTodayOccupancy;
  offDays: OffDay[];
  today: DateOnlyIso;
}) {
  if (occupancy.kind === 'work') {
    const job = jobsById.get(occupancy.slot.jobId) ?? null;

    return (
      <span className="flex min-w-0 items-center gap-2">
        {job ? (
          <EntityThumbnail
            label={job.customerCompanyName ?? job.productName}
            size="sm"
            thumbnailDataUrl={job.customerThumbnailDataUrl}
          />
        ) : null}
        <span className="min-w-0">
          <Link
            className="block truncate font-medium hover:underline"
            params={{ id: occupancy.slot.jobId }}
            to="/jobs/$id"
          >
            {occupancy.slot.jobCode}
          </Link>
          {job ? <span className="block truncate text-xs text-muted-foreground">{job.productName}</span> : null}
        </span>
      </span>
    );
  }

  if (occupancy.kind === 'idle') {
    return <span className="truncate text-muted-foreground">{getSlotLabel(occupancy.slot)}</span>;
  }

  if (occupancy.kind === 'off') {
    return (
      <span className="truncate text-muted-foreground">
        {occupancy.label ?? getOffDayLabel(offDays, today) ?? 'Off-Day'}
      </span>
    );
  }

  return <span className="truncate text-muted-foreground">No work booked today</span>;
}

function ShopFloorOccupancyBadge({ occupancy }: { occupancy: BayTodayOccupancy }) {
  if (occupancy.kind === 'work') {
    return <Badge>Working</Badge>;
  }

  if (occupancy.kind === 'idle') {
    return <Badge variant="secondary">Idle</Badge>;
  }

  if (occupancy.kind === 'off') {
    return <Badge variant="outline">Off</Badge>;
  }

  return <Badge variant="outline">Free</Badge>;
}

function ShopFloorTodayWidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-4 w-28" />
      {SHOP_FLOOR_SKELETON_ROWS.map((row) => (
        <div key={row} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-4 w-full max-w-96" />
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}
