import {
  type BayTodayOccupancy,
  departmentLabels,
  getBayTodayOccupancy,
  getJobDisplayName,
  getJobOfferingKind,
  getOffDayLabel,
  JOB_DEPARTMENT_PIPELINE,
  statusBadgeColorClassNames,
  type WorkingCalendar,
} from '@pkg/domain';
import type { DateOnlyIso, JobSummary, OffDay, ProjectedBayQueue } from '@pkg/schema';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { BayOperatorIndicator } from '@/components/bays/index.js';
import { OfferingThumbnail } from '@/components/thumbnail/OfferingThumbnail.js';
import { Badge } from '@/components/ui/badge.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { cn } from '@/lib/utils.js';

import { getSlotLabel } from '../../jobs/components/board-summary.js';
import { DashboardList, DashboardListItem } from '../DashboardList.js';
import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';
import { SHOP_FLOOR_BAND_HEIGHT_PX } from '../dashboard-widget-layout.js';
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
    <ShopFloorTodayContent
      enabledBays={enabledBays}
      jobsById={jobsById}
      offDays={offDays}
      today={today}
      workingCalendarsByBayId={workingCalendarsByBayId}
    />
  );
};

export function ShopFloorTodayContent({
  enabledBays,
  jobsById,
  offDays,
  today,
  workingCalendarsByBayId,
}: {
  enabledBays: ProjectedBayQueue[];
  jobsById: ReadonlyMap<string, JobSummary>;
  offDays: OffDay[];
  today: DateOnlyIso;
  workingCalendarsByBayId: ReadonlyMap<string, WorkingCalendar>;
}) {
  return (
    <div>
      <ScrollArea style={{ height: SHOP_FLOOR_BAND_HEIGHT_PX }}>
        <div className="flex flex-col gap-4 pr-3">
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
                <DashboardList>
                  {departmentBays.map((bay) => (
                    <DashboardListItem key={bay.id}>
                      <ShopFloorBayRow
                        bay={bay}
                        jobsById={jobsById}
                        offDays={offDays}
                        today={today}
                        workingCalendar={workingCalendarsByBayId.get(bay.id) ?? {}}
                      />
                    </DashboardListItem>
                  ))}
                </DashboardList>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export function ShopFloorBayRow({
  bay,
  jobsById,
  offDays,
  today,
  workingCalendar,
}: {
  bay: ProjectedBayQueue;
  jobsById: ReadonlyMap<string, JobSummary>;
  offDays: OffDay[];
  today: DateOnlyIso;
  workingCalendar: WorkingCalendar;
}) {
  const occupancy = getBayTodayOccupancy({ bay, today, workingCalendar });

  return (
    <div className="grid min-w-0 grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_auto] items-center gap-x-3 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <BayOperatorIndicator operator={bay.currentOperator} />
        <span className="min-w-0">
          <span className="block truncate font-medium">{bay.currentOperator?.name ?? 'No Operator assigned'}</span>
          <span className="block truncate text-xs text-muted-foreground">{bay.name}</span>
        </span>
      </span>
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
    const jobDisplayName = job ? getJobDisplayName(job) : null;

    return (
      <span className="flex min-w-0 items-center gap-2">
        {job ? (
          <OfferingThumbnail
            kind={getJobOfferingKind(job)}
            label={jobDisplayName ?? job.code}
            preview={false}
            thumbnailDataUrl={job.productThumbnailDataUrl}
          />
        ) : null}
        <span className="min-w-0">
          <Link
            className="block truncate font-medium hover:underline"
            params={{ id: occupancy.slot.jobId }}
            to="/equipment/jobs/$id"
          >
            {occupancy.slot.jobCode}
          </Link>
          {jobDisplayName ? (
            <span className="block truncate text-xs text-muted-foreground">{jobDisplayName}</span>
          ) : null}
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
    return (
      <Badge
        className={cn(statusBadgeColorClassNames.blue.chip, statusBadgeColorClassNames.blue.text)}
        variant="outline"
      >
        In progress
      </Badge>
    );
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
    <div className="flex flex-col gap-3" style={{ height: SHOP_FLOOR_BAND_HEIGHT_PX }}>
      <Skeleton className="h-4 w-28" />
      {SHOP_FLOOR_SKELETON_ROWS.map((row) => (
        <div key={row} className="grid grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_auto] items-center gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <span className="flex min-w-0 flex-col gap-2">
              <Skeleton className="h-4 w-24 max-w-full" />
              <Skeleton className="h-3 w-20 max-w-full" />
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <span className="flex min-w-0 flex-col gap-2">
              <Skeleton className="h-4 w-24 max-w-full" />
              <Skeleton className="h-3 w-48 max-w-full" />
            </span>
          </span>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}
